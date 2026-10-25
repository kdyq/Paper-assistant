/**
 * 导出服务（Step 12）：Markdown 精读卡片 + 下载/复制工具。
 * 卡片格式自定（用户无既定模板）：书斋风格，四要素 + 摘要 + 关键定位 + 笔记。
 */
import type { ExtractResult } from './extract'
import type { Note } from '../stores/notes'
import type { Paper } from '../stores/library'

export function buildReadingCard(
  paper: Paper,
  extract: (ExtractResult & { degraded?: boolean }) | null | undefined,
  notes: Note[] = [],
): string {
  const lines: string[] = []
  const metaBits = [paper.venue, paper.year].filter(Boolean).join(' ')
  lines.push(`# 精读卡片 · ${paper.title}`)
  if (paper.titleZh && paper.titleZh !== paper.title) lines.push(`\n**${paper.titleZh}**`)
  lines.push('')
  lines.push(`> ${metaBits || '出处未标注'}${paper.authors.length ? `\n> ${paper.authors.join(', ')}` : ''}`)
  const extra = [paper.doi ? `DOI: ${paper.doi}` : '', `文件: ${paper.fileName}`, `共 ${paper.totalPages} 页`]
    .filter(Boolean)
    .join(' ｜ ')
  if (extra) lines.push(`> ${extra}`)
  lines.push('')

  if (extract?.summary) {
    lines.push('## 摘要', '', extract.summary, '')
  }
  const sect = (label: string, num: string, body?: string, page?: number) => {
    if (!body) return
    lines.push(`## ${num}、${label}`, '', body, page ? `\n（P.${page}）` : '', '')
  }
  if (extract) {
    sect('研究问题', '一', extract.question, extract.pages?.question)
    sect('核心方法', '二', extract.method, extract.pages?.method)
    sect('实验结果', '三', extract.experiment, extract.pages?.experiment)
    if (extract.contribution.length) {
      lines.push('## 四、主要贡献', '')
      extract.contribution.forEach((c, i) => lines.push(`${i + 1}. ${c}`))
      lines.push(extract.pages?.contribution ? `\n（P.${extract.pages.contribution}）` : '', '')
    }
    if (extract.refs.length) {
      lines.push('## 关键定位', '')
      for (const r of extract.refs) {
        lines.push(`- P.${r.page}${r.quote ? ` 「${r.quote}」` : ''}`)
      }
      lines.push('')
    }
  }

  if (notes.length) {
    lines.push('## 读书笔记', '')
    for (const n of notes) {
      const anchor = n.page > 0 ? `P.${n.page}` : '全局'
      lines.push(`### ${anchor}${n.quote ? ` 「${n.quote}」` : ''}`, '', n.content, '')
    }
  }

  lines.push('---', `\n*由 书斋 · 文献阅读助手 导出于 ${new Date().toLocaleDateString('zh-CN')}*`)
  return lines.join('\n')
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
