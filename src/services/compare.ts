/**
 * 文献对比矩阵（Step 13）：五维度提取提示词 + JSON 容错解析。
 * 每篇一次非流式调用（输出短），维度可手改。
 */
import type { ChatMessage } from './ai'

export interface CompareRow {
  question: string // 研究问题
  method: string // 核心方法
  dataset: string // 数据集
  metric: string // 评价指标
  conclusion: string // 主要结论
}

export const COMPARE_DIMS = [
  { key: 'question', label: '研究问题' },
  { key: 'method', label: '核心方法' },
  { key: 'dataset', label: '数据集' },
  { key: 'metric', label: '评价指标' },
  { key: 'conclusion', label: '主要结论' },
] as const

const SYSTEM_PROMPT = `你是论文对比分析助手。根据用户给出的带 [P.页码] 标注的论文文本，输出一个 JSON 对象，包含五个字段，全部用中文、每项不超过 40 字：
{"question":"研究问题","method":"核心方法","dataset":"使用的数据集（无则写「未明确」）","metric":"评价指标（如 PSNR/SSIM/LPIPS/BLEU）","conclusion":"主要结论"}
规则：只输出 JSON 对象本身，不要 markdown 围栏和任何解释。`

export function buildCompareMessages(
  meta: { title: string },
  pages: { page: number; text: string }[],
): ChatMessage[] {
  // 与 extract 同策略：≤12 页全给，否则前 10 页 + 末 2 页；单页 2400 字
  const chosen =
    pages.length <= 12 ? pages : [...pages.slice(0, 10), ...pages.slice(-2)]
  const body = chosen.map((p) => `[P.${p.page}]\n${p.text.slice(0, 2400)}`).join('\n\n')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `标题：${meta.title}\n\n论文文本：\n${body}` },
  ]
}

const DIM_KEYS = ['question', 'method', 'dataset', 'metric', 'conclusion'] as const

export function parseCompareJson(raw: string): CompareRow | null {
  if (!raw?.trim()) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1].includes('{')) s = fence[1].trim()
  else s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const body = s.slice(start, end + 1)
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(body) as Record<string, unknown>
  } catch {
    try {
      obj = JSON.parse(body.replace(/,\s*([}\]])/g, '$1')) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const row: Partial<CompareRow> = {}
  let filled = 0
  for (const k of DIM_KEYS) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) {
      row[k] = v.trim()
      filled++
    } else {
      row[k] = ''
    }
  }
  return filled >= 3 ? (row as CompareRow) : null
}

export function buildCompareMarkdown(
  titles: string[],
  rows: CompareRow[],
): string {
  const lines: string[] = []
  lines.push(`# 文献对比 · ${new Date().toLocaleDateString('zh-CN')}`, '')
  lines.push(`| 维度 | ${titles.join(' | ')} |`)
  lines.push(`|---|${titles.map(() => '---').join('|')}|`)
  for (const dim of COMPARE_DIMS) {
    lines.push(`| ${dim.label} | ${rows.map((r) => (r[dim.key] || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)
  }
  lines.push('', `*由 书斋 · 文献阅读助手 生成*`)
  return lines.join('\n')
}
