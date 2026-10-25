/**
 * 术语表与符号表（Step 14）：一次提取产出术语 + 符号两类条目。
 * JSON 容错解析与 extract/compare 同风格。
 */
import type { ChatMessage } from './ai'

export const GLOSSARY_PROMPT_VER = 'v1'

export interface GlossaryItem {
  kind: 'term' | 'symbol'
  name: string // 术语原文 / 符号
  definition: string // 中文释义
  page: number
}

const SYSTEM_PROMPT = `你是论文术语提取助手。根据带 [P.页码] 标注的论文文本，输出 JSON：
{"items":[{"kind":"term","name":"Diffusion Model","definition":"一类通过逐步加噪与去噪学习数据分布的生成模型","page":2},{"kind":"symbol","name":"α","definition":"噪声调度系数，控制每一步加噪强度","page":3}]}
规则：
1. 只输出 JSON 对象本身，无围栏无解释。
2. items 给 8~16 条：kind 为 "term"（方法/概念术语，6~10 条）与 "symbol"（数学符号，3~8 条）。
3. name 保留原文/原符号；definition 用中文、不超过 40 字。
4. page 为该术语主要定义处页码，必须是文本中出现过的 [P.n] 页码。`

export function buildGlossaryMessages(
  meta: { title: string },
  pages: { page: number; text: string }[],
): ChatMessage[] {
  const chosen = pages.length <= 12 ? pages : [...pages.slice(0, 10), ...pages.slice(-2)]
  const body = chosen.map((p) => `[P.${p.page}]\n${p.text.slice(0, 2400)}`).join('\n\n')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `标题：${meta.title}\n\n论文文本：\n${body}` },
  ]
}

export function parseGlossaryJson(raw: string): GlossaryItem[] | null {
  if (!raw?.trim()) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1].includes('{')) s = fence[1].trim()
  else s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const body = s.slice(start, end + 1)
  let obj: { items?: unknown }
  try {
    obj = JSON.parse(body) as { items?: unknown }
  } catch {
    try {
      obj = JSON.parse(body.replace(/,\s*([}\]])/g, '$1')) as { items?: unknown }
    } catch {
      return null
    }
  }
  if (!Array.isArray(obj.items)) return null
  const out: GlossaryItem[] = []
  for (const it of obj.items) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const definition = typeof o.definition === 'string' ? o.definition.trim() : ''
    const page = Number(o.page)
    if (!name || !definition || !Number.isInteger(page) || page < 1) continue
    out.push({
      kind: o.kind === 'symbol' ? 'symbol' : 'term',
      name: name.slice(0, 60),
      definition: definition.slice(0, 120),
      page,
    })
  }
  return out.length >= 3 ? out : null
}
