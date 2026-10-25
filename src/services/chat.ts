/**
 * 伴读问答：上下文组装与提示词（Step 6）。
 *
 * 上下文有界且可溯源（§4.4）：题录 + 提取摘要 + 选中段落 + 当前页 +
 * 关键词检索 top 页（长文不整篇直塞）+ 近 N 轮对话；
 * 提示词强制回答标注 [P.页码]，Step 9 据此做跳转定位。
 */
import type { ChatMessage } from './ai'

export const CHAT_PROMPT_VER = 'v1'

/** 送入上下文的最大页数与单页字符预算 */
export const MAX_CONTEXT_PAGES = 4
export const PAGE_CHAR_BUDGET = 3500
/** 保留的最近对话轮数（1 轮 = 一问一答） */
export const MAX_HISTORY_ROUNDS = 8

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'to', 'is', 'are', 'was', 'were', 'be',
  'with', 'by', 'at', 'as', 'from', 'that', 'this', 'these', 'those', 'it', 'its', 'we', 'our',
  'what', 'which', 'how', 'why', 'when', 'who', 'can', 'does', 'do', 'did', 'about', 'into',
  '的', '了', '是', '在', '和', '与', '或', '对', '把', '被', '有', '无', '什么', '这个', '那个',
  '怎么', '如何', '为什么', '哪些', '请', '论文', '文章', '作者', '方法', '区别',
])

export function tokenize(text: string): string[] {
  const out: string[] = []
  // 西文词
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (!STOPWORDS.has(w)) out.push(w)
  }
  // 中文 2-gram
  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2))
  }
  return out
}

/** 关键词重叠打分：返回按相关度排序的页码列表（含 currentFirst 置顶） */
export function rankPages(
  question: string,
  pages: { page: number; text: string }[],
  currentPage?: number,
): number[] {
  const qTokens = new Set(tokenize(question))
  if (!qTokens.size) return pages.slice(0, MAX_CONTEXT_PAGES).map((p) => p.page)
  const scored = pages.map((p) => {
    let score = 0
    for (const t of new Set(tokenize(p.text))) {
      if (qTokens.has(t)) score += 1
    }
    return { page: p.page, score }
  })
  scored.sort((a, b) => b.score - a.score)
  const ranked = scored.map((s) => s.page)
  if (currentPage) {
    const i = ranked.indexOf(currentPage)
    if (i >= 0) ranked.splice(i, 1)
    return [currentPage, ...ranked]
  }
  return ranked
}

export interface ChatBrief {
  title: string
  authors: string[]
  year?: number
  venue?: string
}

export interface ChatContext {
  brief: ChatBrief
  /** 提取缓存里的摘要（可选） */
  summary?: string
  /** 用户选中的原文段落（可选） */
  selected?: { text: string; page: number }
  /** 当前阅读页 */
  currentPage?: number
  pages: { page: number; text: string }[]
  history: { role: 'user' | 'assistant'; content: string }[]
  question: string
}

export const CHAT_SYSTEM_PROMPT = `你是论文精读的伴读助手「朱批」。规则：
1. 只依据用户提供的材料回答（材料以 [P.n] 开头分段），不编造页码或内容。
2. 全程用中文回答（引用原文短语时可保留原文语言）。
3. 关键论断处标注来源页码，格式为 [P.页码]，至少一处；没有依据时明确说明「材料中未提及」。
4. 回答简明：默认不超过 300 字；用户要求展开时可更长。`

export function buildChatMessages(ctx: ChatContext): ChatMessage[] {
  const { brief, summary, selected, currentPage, pages, history, question } = ctx

  const ranked = rankPages(question, pages, currentPage)
  const pageSet = new Set<number>()
  const chosen: { page: number; text: string }[] = []
  for (const p of ranked) {
    if (chosen.length >= MAX_CONTEXT_PAGES) break
    if (pageSet.has(p)) continue
    pageSet.add(p)
    const row = pages.find((x) => x.page === p)
    if (row && row.text.trim()) chosen.push({ page: p, text: row.text.slice(0, PAGE_CHAR_BUDGET) })
  }

  const parts: string[] = []
  parts.push(
    `【题录】${brief.title}${brief.authors.length ? ` / ${brief.authors.slice(0, 6).join(', ')}` : ''}${
      [brief.venue, brief.year].filter(Boolean).length ? ` / ${[brief.venue, brief.year].filter(Boolean).join(' ')}` : ''
    }`,
  )
  if (summary) parts.push(`【摘要】${summary.slice(0, 600)}`)
  if (selected?.text) parts.push(`【用户选中段落 · 来自 P.${selected.page}】${selected.text.slice(0, 1200)}`)
  for (const p of chosen) parts.push(`[P.${p.page}]\n${p.text}`)
  parts.push(`【问题】${question}`)

  const historyTurns = history.slice(-MAX_HISTORY_ROUNDS * 2)
  const msgs: ChatMessage[] = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }]
  for (const h of historyTurns) msgs.push({ role: h.role, content: h.content })
  msgs.push({ role: 'user', content: parts.join('\n\n') })
  return msgs
}

/** 从回答文本中提取 [P.x] 页码引用（Step 9 用 refs 做跳转） */
export function extractPageRefs(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/\[P\.(\d{1,4})\]/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= 9999) out.add(n)
  }
  return [...out]
}
