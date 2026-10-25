/**
 * pdfjs 服务：加载 / 元数据 / 逐页文本（规范化）。
 * worker 走 npm 资产 + Vite 显式 ?url，不走 CDN（§8 风险对策）。
 */
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type PdfDoc = pdfjs.PDFDocumentProxy

export async function openPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // pdfjs 会 transfer/detach 传入的 ArrayBuffer，调用方需要保留原数据时须先复制
  const task = pdfjs.getDocument({ data })
  return task.promise
}

export async function getPdfMetadata(doc: PdfDoc): Promise<{ title?: string; author?: string }> {
  const meta = await doc.getMetadata().catch(() => null)
  const info = (meta?.info ?? {}) as Record<string, unknown>
  return {
    title: typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined,
    author:
      typeof info.Author === 'string' && info.Author.trim() ? info.Author.trim() : undefined,
  }
}

/** 取一页的原始文本层（按 pdfjs item 顺序拼接，保留行结构） */
async function rawPageText(doc: PdfDoc, pageNo: number): Promise<string> {
  const page = await doc.getPage(pageNo)
  const content = await page.getTextContent()
  const lines: string[] = []
  let current = ''
  let lastY: number | null = null
  let lastEndX: number | null = null
  for (const item of content.items) {
    if (!('str' in item)) continue
    const t = item as { str: string; transform: number[]; hasEOL?: boolean; width: number }
    const y = Math.round(t.transform[5])
    const x = t.transform[4]
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      lines.push(current)
      current = t.str
    } else {
      // 同一行：item 之间若无自然空隙则补空格（pdfjs 常丢失词间空格）
      const gap = lastEndX !== null ? x - lastEndX : 0
      const prev = current
      const needSpace =
        prev &&
        !/\s$/.test(prev) &&
        !/^\s/.test(t.str) &&
        gap > 1 &&
        /[\x20-\x7E]$/.test(prev) &&
        /^[\x20-\x7E]/.test(t.str) // 仅西文词间补格，中文不补
      current += (needSpace ? ' ' : '') + t.str
    }
    lastY = y
    lastEndX = x + (t.width ?? 0)
    if (t.hasEOL) {
      lines.push(current)
      current = ''
      lastY = null
      lastEndX = null
    }
  }
  if (current) lines.push(current)
  return lines.filter((l) => l.length > 0).join('\n')
}

/**
 * 文本归一化（§8 中文论文质量对策）：
 * - 英文断词连字 "distribu-\ntion" → "distribution"
 * - CJK 字符间多余空格去除
 * - 连续空白折叠
 */
export function normalizeText(raw: string): string {
  let s = raw.replace(/\r/g, '')
  // 英文行尾连字
  s = s.replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
  // CJK 之间去掉空格（中/日文排版空格无意义）
  s = s.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])[ \t]+(?=[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1')
  // 行内多空格折叠
  s = s.replace(/[ \t]{2,}/g, ' ')
  // 3 行以上连续空行折叠为 1 行
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 提取并规范化指定页文本 */
export async function getPageText(doc: PdfDoc, pageNo: number): Promise<string> {
  return normalizeText(await rawPageText(doc, pageNo))
}

export async function countEmptyTextPages(pages: string[]): Promise<number> {
  return pages.filter((t) => t.replace(/\s/g, '').length < 20).length
}
