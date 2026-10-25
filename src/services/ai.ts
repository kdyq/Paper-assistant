/**
 * AI 调用层（OpenAI 协议 /chat/completions）：
 * 非流式 / 流式 SSE / 连接测试 / 错误分类（401/超时/CORS 等）。
 * 代理开关打开时走本地 dev server 的 /ai 前缀（CORS 兜底）。
 */
import { useSettingsStore } from '../stores/settings'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiErrorKind = 'auth' | 'notfound' | 'rate' | 'server' | 'cors' | 'abort' | 'nokey' | 'parse' | 'other'

export class AiError extends Error {
  kind: AiErrorKind
  status?: number
  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export interface ChatOptions {
  stream?: boolean
  onDelta?: (text: string) => void
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /** 覆盖生效配置（连接测试时用表单当前值，不必先保存） */
  override?: { baseUrl?: string; model?: string; apiKey?: string }
  /** 强制代理路径（连接测试「代理」按钮） */
  forceProxy?: boolean
}

function resolveEndpoint(baseUrl: string, proxy: boolean): string {
  const base = proxy ? '/ai' : baseUrl.replace(/\/+$/, '')
  return `${base}/chat/completions`
}

function classifyStatus(status: number, body: string): AiError {
  const detail = body.slice(0, 300).replace(/\s+/g, ' ')
  if (status === 401 || status === 403) {
    return new AiError('auth', `鉴权失败（${status}）：API Key 无效或无权限。${detail}`, status)
  }
  if (status === 404) {
    return new AiError('notfound', `接口或模型不存在（404）：请检查 Base URL 与模型名。${detail}`, status)
  }
  if (status === 429) {
    return new AiError('rate', `请求过于频繁或额度不足（429）。${detail}`, status)
  }
  if (status >= 500) {
    return new AiError('server', `AI 服务端错误（${status}）。${detail}`, status)
  }
  return new AiError('other', `请求失败（${status}）。${detail}`, status)
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const settings = useSettingsStore()
  await settings.ensureLoaded()
  const eff = settings.effectiveAi
  const cfg = {
    baseUrl: opts.override?.baseUrl ?? eff.baseUrl,
    model: opts.override?.model ?? eff.model,
    apiKey: opts.override?.apiKey ?? eff.apiKey,
  }
  const proxy = opts.forceProxy ?? settings.proxy
  if (!cfg.apiKey) {
    throw new AiError('nokey', '未配置 API Key：请在设置页填写（或由 .env 提供默认值）。')
  }
  const stream = !!opts.onDelta || !!opts.stream

  let res: Response
  try {
    res = await fetch(resolveEndpoint(cfg.baseUrl, proxy), {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? settings.ai.temperature,
        max_tokens: opts.maxTokens,
        stream,
      }),
    })
  } catch (e) {
    if (opts.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
      throw new AiError('abort', '请求已取消。')
    }
    throw new AiError(
      'cors',
      '无法连接 AI 服务：请求被浏览器拦截（CORS）或网络不可达。可在设置页开启「本地开发代理」后重试。',
    )
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw classifyStatus(res.status, body)
  }

  // 非流式（思考型模型短回复时 content 可能为空、内容在 reasoning_content，均视为连通）
  if (!stream) {
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[]
    }
    const msg = data.choices?.[0]?.message
    return msg?.content ?? msg?.reasoning_content ?? ''
  }

  // 流式 SSE：data: 行 → choices[0].delta.content
  const reader = res.body?.getReader()
  if (!reader) throw new AiError('parse', '响应流不可读。')
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  let reasoning = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload) as {
          choices?: { delta?: { content?: string; reasoning_content?: string } }[]
        }
        const delta = j.choices?.[0]?.delta
        if (delta?.content) {
          full += delta.content
          opts.onDelta?.(delta.content)
        } else if (delta?.reasoning_content) {
          reasoning += delta.reasoning_content
        }
      } catch {
        // 半包/心跳行，忽略
      }
    }
  }
  // 思考型模型可能只有 reasoning 输出
  const result = full || reasoning
  if (!result.trim()) throw new AiError('parse', 'AI 流式返回为空，请重试。')
  return result
}

export interface TestResult {
  ok: boolean
  message: string
  ms: number
}

/** 连接测试：1 token 级请求，回报成功/失败原因（可用表单当前值，不强制先保存） */
export async function testConnection(override?: ChatOptions['override'], forceProxy?: boolean): Promise<TestResult> {
  const t0 = performance.now()
  const settings = useSettingsStore()
  await settings.ensureLoaded()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const reply = await chat(
      [{ role: 'user', content: '回复「ok」两个字母即可，不要任何其他内容。' }],
      { maxTokens: 64, signal: controller.signal, override, forceProxy },
    )
    const ms = Math.round(performance.now() - t0)
    const model = override?.model || settings.effectiveAi.model
    const brief = reply.trim().slice(0, 20) || '（思考型模型短回复，无可见文本）'
    return { ok: true, message: `连接成功（${ms}ms）· ${model} 应答：「${brief}」`, ms }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    if (e instanceof AiError) {
      if (e.kind === 'abort') return { ok: false, message: `连接超时（>${ms}ms）：服务未在 20 秒内应答。`, ms }
      return { ok: false, message: e.message, ms }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e), ms }
  } finally {
    clearTimeout(timer)
  }
}
