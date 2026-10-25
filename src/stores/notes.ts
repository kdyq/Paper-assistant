import { defineStore } from 'pinia'
import { dbDelete, dbGetAllByIndex, dbPut } from '../services/db'

export interface Note {
  id: string
  paperId: string
  page: number // 0 = 全局笔记（无页码锚点）
  quote: string // 原文引文（可空）
  content: string
  createdAt: number
  updatedAt: number
}

/** 笔记域 store（Step 7）：per-paper 增删改查 */
export const useNotesStore = defineStore('notes', {
  state: () => ({
    notes: [] as Note[],
    loadedFor: '',
    focusTick: 0, // 记笔记成功后让伴读面板切到笔记 tab
  }),
  getters: {
    /** 当前文献笔记，页码笔记在前（按页升序），全局在后（按更新时间倒序） */
    current(state): Note[] {
      const all = state.notes.filter((n) => n.paperId === state.loadedFor)
      const paged = all.filter((n) => n.page > 0).sort((a, b) => a.page - b.page)
      const global = all.filter((n) => n.page === 0).sort((a, b) => b.updatedAt - a.updatedAt)
      return [...paged, ...global]
    },
  },
  actions: {
    async load(paperId: string) {
      this.notes = await dbGetAllByIndex<Note>('notes', 'by-paper', paperId)
      this.loadedFor = paperId
    },

    async create(paperId: string, data: { page: number; quote: string; content: string }) {
      const now = Date.now()
      const note: Note = { id: `n${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, paperId, ...data, createdAt: now, updatedAt: now }
      await dbPut('notes', note)
      if (this.loadedFor === paperId) this.notes.push(note)
      return note
    },

    async update(id: string, patch: Partial<Pick<Note, 'content' | 'quote' | 'page'>>) {
      const n = this.notes.find((x) => x.id === id)
      if (!n) return
      Object.assign(n, patch, { updatedAt: Date.now() })
      await dbPut('notes', n)
    },

    async remove(id: string) {
      await dbDelete('notes', id)
      this.notes = this.notes.filter((n) => n.id !== id)
    },
  },
})
