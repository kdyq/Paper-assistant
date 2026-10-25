/**
 * 四要素提取：提示词、JSON 容错解析、流式渐进取值。
 * 纯函数模块（不依赖 Vue/Pinia），便于单测（verify/extract_parse_test.ts）。
 */
import type { ChatMessage } from './ai'

export const EXTRACT_PROMPT_VER = 'v1'

export interface ExtractRef {
  page: number
  quote?: string
}

export interface ExtractResult {
  summary: string
  question: string
  method: string
  experiment: string
  contribution: string[]
  refs: ExtractRef[]
  pages?: Record<string, number>
}

const SCHEMA_DESC = `{"summary":"200字内中文摘要","question":"研究问题（中文一句话）","question_page":1,"method":"核心方法（中文2-3句）","method_page":2,"experiment":"实验结果（中文，含关键数据）","experiment_page":5,"contribution":["贡献1","贡献2","贡献3"],"contribution_page":1,"refs":[{"page":3,"quote":"原文关键短句（保留原文语言）"}]}`

const SYSTEM_PROMPT = `你是论文精读助手。用户会给出带 [P.页码] 标注的论文文本。请提取四要素并输出 JSON，规则：
1. 只输出一个 JSON 对象本身——不要 markdown 代码围栏、不要任何解释文字。
2. summary/question/method/experiment/contribution 内容全部用中文（refs.quote 保留原文语言）。
3. *_page 字段是该要素主要依据所在页码，必须是正整数，且只能取文本中出现过的 [P.n] 页码。
4. refs 给 2~6 条关键论断定位（页码 + 原文短句）。
5. contribution 为 3~5 条字符串数组。
JSON 结构：${SCHEMA_DESC}`

export interface PaperMetaBrief {
  title: string
  authors: string[]
  year?: number
  venue?: string
}

/** 上下文有界：≤12 页全给；更长给前 10 页 + 末 2 页（结论常在末尾）；单页截 4000 字 */
function selectPages(pages: { page: number; text: string }[]): { page: number; text: string }[] {
  if (pages.length <= 12) return pages
  return [...pages.slice(0, 10), ...pages.slice(-2)]
}

export function buildExtractMessages(
  meta: PaperMetaBrief,
  pages: { page: number; text: string }[],
): ChatMessage[] {
  const head = `标题：${meta.title}\n作者：${meta.authors.join(', ') || '未知'}\n出处：${[meta.venue, meta.year].filter(Boolean).join(' ') || '未知'}`
  const body = selectPages(pages)
    .map((p) => `[P.${p.page}]\n${p.text.slice(0, 4000)}`)
    .join('\n\n')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${head}\n\n论文文本：\n${body}` },
  ]
}

function unescapeJsonString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function coerceString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(coerceString).filter(Boolean)
  if (typeof v === 'string') return [v.trim()].filter(Boolean)
  return []
}

function coerceRefs(v: unknown): ExtractRef[] {
  if (!Array.isArray(v)) return []
  const out: ExtractRef[] = []
  for (const r of v) {
    if (!r || typeof r !== 'object') continue
    const page = Number((r as { page?: unknown }).page)
    if (!Number.isInteger(page) || page < 1) continue
    out.push({ page, quote: coerceString((r as { quote?: unknown }).quote) || undefined })
  }
  return out.slice(0, 8)
}

/**
 * JSON 容错解析（§4.4）：
 * 剥 markdown 围栏 → 截取首个 { 到末个 } → JSON.parse → 字段矫正。
 * 失败返回 null（调用方重试一次后降级纯文本）。
 */
export function parseExtractJson(raw: string): ExtractResult | null {
  if (!raw || !raw.trim()) return null
  let s = raw.trim()
  // 剥 ```json ... ``` 围栏（可能只出现开头围栏）
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1].includes('{')) s = fence[1].trim()
  else s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  // 截取 JSON 主体
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const body = s.slice(start, end + 1)
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(body) as Record<string, unknown>
  } catch {
    // 常见尾逗号容错一次
    try {
      obj = JSON.parse(body.replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  const result: ExtractResult = {
    summary: coerceString(obj.summary),
    question: coerceString(obj.question),
    method: coerceString(obj.method),
    experiment: coerceString(obj.experiment),
    contribution: coerceStringArray(obj.contribution),
    refs: coerceRefs(obj.refs),
    pages: {},
  }
  for (const k of ['summary', 'question', 'method', 'experiment', 'contribution'] as const) {
    const n = Number(obj[`${k}_page`])
    if (Number.isInteger(n) && n >= 1) result.pages![k] = n
  }
  const hasCore = result.question || result.method || result.experiment
  if (!hasCore) return null
  return result
}

/** 流式渐进取值：从半成品 JSON 缓冲里抠已完成字段，让提取卡边生成边填充 */
export function streamProgressiveFields(buf: string): Partial<ExtractResult> {
  const out: Partial<ExtractResult> = {}
  const textOf = (key: string): string | undefined => {
    const m = buf.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
    return m ? unescapeJsonString(m[1]).trim() : undefined
  }
  for (const key of ['summary', 'question', 'method', 'experiment'] as const) {
    const v = textOf(key)
    if (v) out[key] = v
  }
  const cm = buf.match(/"contribution"\s*:\s*\[([\s\S]*?)\]/)
  if (cm) {
    const items = [...cm[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => unescapeJsonString(m[1]).trim()).filter(Boolean)
    if (items.length) out.contribution = items
  }
  const pm = buf.match(/"question_page"\s*:\s*(\d+)/)
  if (pm) out.pages = { question: Number(pm[1]) }
  return out
}
