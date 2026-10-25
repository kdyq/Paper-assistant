import { defineStore } from 'pinia'
import {
  dbDeletePaperCascade,
  dbGet,
  dbGetAll,
  dbPut,
  dbPutMany,
} from '../services/db'
import { getPdfMetadata, getPageText, openPdf } from '../services/pdf'
import { guessMeta } from '../utils/heuristics'
import { uid } from '../utils/id'

export type PaperStatus = 'unread' | 'reading' | 'done'

export interface Paper {
  id: string
  title: string
  titleZh?: string
  authors: string[]
  year?: number
  venue?: string
  doi?: string
  fileName: string
  size: number
  addedAt: number
  status: PaperStatus
  rating?: number // 1-5
  tags: string[]
  lastPage: number
  totalPages: number
  pdfBlob?: Blob // 结构化克隆直接存 Blob
  textEmpty?: boolean // 扫描版检测：文本层近乎为空
}

export interface PageTextRow {
  paperId: string
  page: number
  text: string
}

export type ImportPhase = 'idle' | 'parsing' | 'saving' | 'error'

export const useLibraryStore = defineStore('library', {
  state: () => ({
    papers: [] as Paper[],
    loaded: false,
    currentId: null as string | null,
    importPhase: 'idle' as ImportPhase,
    importProgress: 0, // 0-100
    importFile: '',
    importError: '',
    filterStatus: 'all' as 'all' | PaperStatus, // Step 8 书架筛选
    filterTags: [] as string[],
  }),
  getters: {
    current(state): Paper | undefined {
      return state.papers.find((p) => p.id === state.currentId)
    },
    allTags(state): string[] {
      return [...new Set(state.papers.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'zh'))
    },
    filtered(state): Paper[] {
      return state.papers.filter((p) => {
        if (state.filterStatus !== 'all' && p.status !== state.filterStatus) return false
        if (state.filterTags.length && !state.filterTags.every((t) => p.tags.includes(t))) return false
        return true
      })
    },
    filterActive(state): boolean {
      return state.filterStatus !== 'all' || state.filterTags.length > 0
    },
  },
  actions: {
    async load() {
      this.papers = (await dbGetAll<Paper>('papers')).sort((a, b) => b.addedAt - a.addedAt)
      this.loaded = true
    },

    /** 上传导入：解析 → 题录启发式 → 存 papers + pageTexts。三态由 importPhase 表达 */
    async importFiles(files: File[] | FileList) {
      const list = Array.from(files)
      this.importError = ''
      for (const file of list) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        if (!isPdf) {
          this.importPhase = 'error'
          this.importError = `「${file.name}」不是 PDF 文件，已跳过（仅支持 .pdf）`
          continue
        }
        this.importPhase = 'parsing'
        this.importFile = file.name
        this.importProgress = 0
        try {
          const buf = await file.arrayBuffer()
          const doc = await openPdf(buf.slice(0))
          const meta = await getPdfMetadata(doc)
          const total = doc.numPages

          const pageTexts: string[] = []
          for (let i = 1; i <= total; i++) {
            pageTexts.push(await getPageText(doc, i))
            this.importProgress = Math.round((i / total) * 90)
            if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0)) // 让 UI 呼吸
          }
          const emptyCount = pageTexts.filter((t) => t.replace(/\s/g, '').length < 20).length
          const guess = guessMeta(pageTexts[0] ?? '', meta.title)

          this.importPhase = 'saving'
          const id = uid()
          const paper: Paper = {
            id,
            title: guess.title || file.name.replace(/\.pdf$/i, ''),
            titleZh: guess.titleZh,
            authors: guess.authors,
            year: guess.year,
            venue: guess.venue,
            doi: guess.doi,
            fileName: file.name,
            size: file.size,
            addedAt: Date.now(),
            status: 'unread',
            tags: [],
            lastPage: 1,
            totalPages: total,
            pdfBlob: new Blob([buf], { type: 'application/pdf' }),
            textEmpty: emptyCount > total * 0.6,
          }
          await dbPut('papers', paper)
          await dbPutMany<PageTextRow>(
            'pageTexts',
            pageTexts.map((text, idx) => ({ paperId: id, page: idx + 1, text })),
          )
          this.papers.unshift(paper)
          this.importPhase = 'idle'
          this.importProgress = 100

          if (paper.textEmpty) {
            this.importError = `「${file.name}」疑似扫描版（无文本层）：不支持 OCR，AI 提取/问答/检索将受限，阅读不受影响。`
            this.importPhase = 'error' // 复用错误条展示警示，但不阻断
          }
        } catch (e) {
          this.importPhase = 'error'
          this.importError = `「${file.name}」解析失败：${e instanceof Error ? e.message : String(e)}`
        }
      }
    },

    async updateMeta(id: string, patch: Partial<Paper>) {
      const p = this.papers.find((x) => x.id === id)
      if (!p) return
      Object.assign(p, patch)
      await dbPut('papers', p)
    },

    async setStatus(id: string, status: PaperStatus) {
      await this.updateMeta(id, { status })
    },

    async openPaper(id: string) {
      this.currentId = id
      const p = this.papers.find((x) => x.id === id)
      if (p && p.status === 'unread') await this.setStatus(id, 'reading')
    },

    async addTag(id: string, tag: string) {
      const t = tag.trim()
      if (!t) return
      const p = this.papers.find((x) => x.id === id)
      if (!p || p.tags.includes(t)) return
      await this.updateMeta(id, { tags: [...p.tags, t] })
    },

    async removeTag(id: string, tag: string) {
      const p = this.papers.find((x) => x.id === id)
      if (!p) return
      await this.updateMeta(id, { tags: p.tags.filter((t) => t !== tag) })
    },

    async setRating(id: string, rating: number) {
      await this.updateMeta(id, { rating: Math.max(1, Math.min(5, rating)) })
    },

    async saveProgress(id: string, lastPage: number) {
      const p = this.papers.find((x) => x.id === id)
      if (!p || lastPage === p.lastPage) return
      await this.updateMeta(id, { lastPage })
    },

    async remove(id: string) {
      await dbDeletePaperCascade(id)
      this.papers = this.papers.filter((p) => p.id !== id)
      if (this.currentId === id) this.currentId = null
    },

    toggleTagFilter(tag: string) {
      this.filterTags = this.filterTags.includes(tag)
        ? this.filterTags.filter((t) => t !== tag)
        : [...this.filterTags, tag]
    },

    clearFilters() {
      this.filterStatus = 'all'
      this.filterTags = []
    },
  },
})

/** 供 AI/搜索直接读某文献逐页文本（按页排序） */
export async function loadPageTexts(paperId: string): Promise<PageTextRow[]> {
  const rows = await dbGetAll<PageTextRow>('pageTexts')
  return rows.filter((r) => r.paperId === paperId).sort((a, b) => a.page - b.page)
}

export async function loadPaperBlob(paperId: string): Promise<Blob | undefined> {
  const p = await dbGet<Paper>('papers', paperId)
  return p?.pdfBlob
}
