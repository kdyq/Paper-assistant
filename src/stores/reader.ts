import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { getPaperDoc, type PdfDoc } from '../services/pdf'
import { useLibraryStore } from './library'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2

/**
 * 阅读器状态：单页模式、翻页、缩放（0.5~2 × 适应宽度）、选中文本。
 * PDFDocumentProxy 用 markRaw 避免被响应式代理（pdfjs 内部状态不可代理）。
 */
export const useReaderStore = defineStore('reader', {
  state: () => ({
    paperId: null as string | null,
    doc: null as PdfDoc | null,
    pageNo: 1,
    totalPages: 0,
    zoom: 1,
    rendering: false,
    ready: false,
    error: '',
    selectedText: '',
    selectedPage: 0,
    highlightQuote: '',
    highlightTick: 0, // 每次递增触发一次文本层高亮
  }),
  actions: {
    async open(paperId: string) {
      const library = useLibraryStore()
      const paper = library.papers.find((p) => p.id === paperId)
      if (!paper?.pdfBlob) {
        this.error = '未找到文献原始文件'
        return
      }
      this.error = ''
      this.ready = false
      this.selectedText = ''
      try {
        const doc = await getPaperDoc(paperId, paper.pdfBlob)
        this.doc = markRaw(doc)
        this.paperId = paperId
        this.totalPages = doc.numPages
        this.pageNo = Math.min(Math.max(1, paper.lastPage), doc.numPages)
        this.zoom = 1
        this.ready = true
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
      }
    },

    async goTo(page: number) {
      if (!this.totalPages) return
      const n = Math.min(Math.max(1, page), this.totalPages)
      if (n === this.pageNo) return
      this.pageNo = n
      this.selectedText = ''
      const library = useLibraryStore()
      if (this.paperId) void library.saveProgress(this.paperId, n)
    },

    async nextPage() {
      await this.goTo(this.pageNo + 1)
    },
    async prevPage() {
      await this.goTo(this.pageNo - 1)
    },

    setZoom(z: number) {
      this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
    },
    zoomIn() {
      this.setZoom(this.zoom + 0.1)
    },
    zoomOut() {
      this.setZoom(this.zoom - 0.1)
    },
    resetZoom() {
      this.setZoom(1)
    },

    setSelection(text: string, page: number) {
      this.selectedText = text
      this.selectedPage = page
    },

    /** 笔记/引用跳转：翻页 + 渲染完成后 flash 高亮引文（PdfSheet 监听 highlightTick） */
    async jumpWithHighlight(page: number, quote: string) {
      await this.goTo(page)
      this.highlightQuote = quote
      this.highlightTick++
    },
  },
})
