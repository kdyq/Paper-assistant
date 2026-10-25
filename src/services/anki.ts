/**
 * Anki 导出（Step 15）：精读卡四要素 + 术语/符号 + 笔记 → 卡片。
 * 输出两种格式：Anki 牌组文本（带 #separator/#deck 头，Anki 2.1.55+ 直接导入）与纯 TSV。
 * 字段内 tab/换行替换，#html:false 纯文本导入。
 */
import type { ExtractResult } from './extract'
import type { GlossaryItem } from './glossary'
import type { Note } from '../stores/notes'
import type { Paper } from '../stores/library'

export interface AnkiCard {
  front: string
  back: string
  tags: string[]
}

const P = (n?: number) => (n ? `（P.${n}）` : '')

export function buildAnkiCards(
  paper: Paper,
  extract?: (ExtractResult & { degraded?: boolean }) | null,
  glossary: GlossaryItem[] = [],
  notes: Note[] = [],
): AnkiCard[] {
  const cards: AnkiCard[] = []
  const tag = paper.tags.join(' ')

  if (extract && !extract.degraded) {
    if (extract.summary) {
      cards.push({
        front: `【${paper.title}】这篇论文讲了什么？`,
        back: extract.summary,
        tags: [tag, '摘要'],
      })
    }
    if (extract.question) {
      cards.push({ front: `【${paper.title}】研究问题是什么？`, back: `${extract.question} ${P(extract.pages?.question)}`, tags: [tag, '研究问题'] })
    }
    if (extract.method) {
      cards.push({ front: `【${paper.title}】核心方法是什么？`, back: `${extract.method} ${P(extract.pages?.method)}`, tags: [tag, '方法'] })
    }
    if (extract.experiment) {
      cards.push({ front: `【${paper.title}】实验结果如何？`, back: `${extract.experiment} ${P(extract.pages?.experiment)}`, tags: [tag, '实验'] })
    }
    if (extract.contribution.length) {
      const body = extract.contribution.map((c, i) => `${i + 1}. ${c}`).join('\n')
      cards.push({ front: `【${paper.title}】主要贡献有哪些？`, back: `${body} ${P(extract.pages?.contribution)}`, tags: [tag, '贡献'] })
    }
  }

  for (const g of glossary) {
    if (g.kind === 'symbol') {
      cards.push({ front: `【${paper.title}】符号「${g.name}」的含义？`, back: `${g.definition} ${P(g.page)}`, tags: [tag, '符号'] })
    } else {
      cards.push({ front: `【${paper.title}】什么是「${g.name}」？`, back: `${g.definition} ${P(g.page)}`, tags: [tag, '术语'] })
    }
  }

  for (const n of notes) {
    const anchor = n.page > 0 ? `（P.${n.page}）` : ''
    const front = n.quote ? `【${paper.title}】关于「${n.quote.slice(0, 40)}」的笔记要点是？` : `【${paper.title}】笔记（全局）`
    cards.push({ front, back: `${n.content} ${anchor}`.trim(), tags: [tag, '笔记'] })
  }

  return cards.filter((c) => c.front && c.back)
}

function field(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, '；').trim()
}

export function buildAnkiTsv(cards: AnkiCard[]): string {
  return cards.map((c) => [field(c.front), field(c.back), field(c.tags.join(' '))].join('\t')).join('\n')
}

/** Anki 牌组文本：头部指令 + TSV（Anki 2.1.55+ 直接导入） */
export function buildAnkiDeck(cards: AnkiCard[], deckName: string): string {
  const lines = [
    '#separator:tab',
    '#html:false',
    `#tags column:3`,
    `#deck:${deckName}`,
    '#columns:正面\t背面\t标签',
  ]
  return [...lines, buildAnkiTsv(cards)].join('\n')
}
