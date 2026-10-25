/**
 * 在 pdfjs TextLayer 中定位引文并 flash 高亮（Step 7 笔记跳转 / Step 9 引用定位共用）。
 * 层内 span 为绝对定位、文本透明；命中则给覆盖到的 span 加 .hl.flash 并滚动到位。
 */
function normText(s: string): string {
  return s.replace(/\s+/g, '')
}

interface SpanRec {
  el: HTMLElement
  text: string // 规范化后的文本
}

export function flashQuoteInTextLayer(layer: HTMLElement, quote: string): boolean {
  const target = normText(quote)
  if (target.length < 2) return false

  // 之前的高亮先清掉
  layer.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl', 'flash'))

  const spans = Array.from(layer.querySelectorAll('span')).filter(
    (el) => el.textContent && el.textContent.trim().length > 0,
  ) as HTMLElement[]
  const recs: SpanRec[] = []
  let full = ''
  for (const el of spans) {
    const t = normText(el.textContent ?? '')
    recs.push({ el, text: t, })
    full += t
  }
  const idx = full.indexOf(target)
  if (idx < 0) return false

  // 找覆盖 [idx, idx+len) 的 span
  let pos = 0
  const end = idx + target.length
  const hit: HTMLElement[] = []
  for (const r of recs) {
    const start = pos
    pos += r.text.length
    if (pos > idx && start < end && r.text.length) hit.push(r.el)
  }
  if (!hit.length) return false

  for (const el of hit) {
    el.classList.add('hl', 'flash')
  }
  hit[0].scrollIntoView({ behavior: 'smooth', block: 'center' })

  // 动画后保留赭黄底（.hl），移除 flash 动画类
  setTimeout(() => {
    hit.forEach((el) => el.classList.remove('flash'))
  }, 1800)
  return true
}
