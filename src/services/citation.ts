/**
 * 引文格式（Step 16）：APA 7 与 GB/T 7714-2015。
 * 启发式题录可能不全（无作者/年份），尽力生成、可再手改题录。
 */
import type { Paper } from '../stores/library'

const CONF_VENUES = /CVPR|ICCV|ECCV|NeurIPS|NIPS|ICML|ICLR|AAAI|IJCAI|ACL|EMNLP|NAACL|SIGIR|KDD|ACM MM|arxiv|conference|proceedings/i

/** "First Last" → "Last, F."；已是 "Last, F." 形式原样；中文名原样 */
function apaName(name: string): string {
  const s = name.trim()
  if (!s) return ''
  if (/[\u4e00-\u9fff]/.test(s)) return s
  if (s.includes(',')) return s // 已是 Last, F. 形式
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0].toUpperCase() + '.')
    .join(' ')
  return `${last}, ${initials}`
}

function gbName(name: string): string {
  const s = name.trim()
  if (!s) return ''
  if (/[\u4e00-\u9fff]/.test(s)) return s
  if (s.includes(',')) {
    // "Last, F." → "LAST F"
    const [last, initials] = s.split(',').map((x) => x.trim())
    return `${last.toUpperCase()} ${initials.replace(/\./g, ' ').trim()}`.trim()
  }
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].toUpperCase()
  const last = parts[parts.length - 1]
  const initials = parts
    .slice(0, -1)
    .map((p) => p[0].toUpperCase())
    .join(' ')
  return `${last.toUpperCase()} ${initials}`.trim()
}

export function toApa(paper: Paper): string {
  const authors = paper.authors.filter(Boolean)
  const year = paper.year ?? 'n.d.'
  let authorPart: string
  if (!authors.length) authorPart = `${paper.title}.`
  else if (authors.length === 1) authorPart = `${apaName(authors[0])}.`
  else if (authors.length <= 6) {
    authorPart = `${authors.slice(0, -1).map(apaName).join(', ')}, & ${apaName(authors[authors.length - 1])}.`
  } else {
    authorPart = `${authors.slice(0, 3).map(apaName).join(', ')}, et al.`
  }
  const venue = paper.venue ?? ''
  const tail = venue ? ` ${venue}.` : paper.doi ? ` https://doi.org/${paper.doi}` : '.'
  return `${authorPart} (${year}). ${paper.title}.${tail}`
}

export function toGbT7714(paper: Paper): string {
  const authors = paper.authors.filter(Boolean)
  let authorPart: string
  if (!authors.length) authorPart = ''
  else if (authors.length <= 3) authorPart = `${authors.map(gbName).join(', ')}, `
  else authorPart = `${authors.slice(0, 3).map(gbName).join(', ')}, 等, `
  const year = paper.year ?? ''
  const venue = paper.venue ?? ''
  const type = CONF_VENUES.test(venue) ? '[C]' : venue ? '[J]' : '[EB/OL]'
  const venuePart = venue ? `//${venue}, ` : ''
  return `${authorPart}${paper.title}${type}${venuePart}${year}${paper.doi ? ` DOI:${paper.doi}` : ''}.`
}
