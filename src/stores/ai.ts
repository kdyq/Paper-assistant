import { defineStore } from 'pinia'
import { AiError, chat, type ChatMessage } from '../services/ai'
import { dbGet, dbPut } from '../services/db'
import {
  EXTRACT_PROMPT_VER,
  buildExtractMessages,
  parseExtractJson,
  streamProgressiveFields,
  type ExtractResult,
} from '../services/extract'
import { loadPageTexts, useLibraryStore } from './library'
import { useSettingsStore } from './settings'

export interface ExtractRow extends ExtractResult {
  paperId: string
  model: string
  promptVer: string
  createdAt: number
  degraded?: boolean // JSON 解析失败降级为纯文本
}

export type ExtractStatus = 'idle' | 'running' | 'done' | 'error'

interface ExtractState {
  paperId: string
  status: ExtractStatus
  buf: string
  reasoningLen: number // 思考型模型推理阶段字数（进度反馈）
  data: ExtractResult | null
  degraded: boolean
  fromCache: boolean
  cachedAt: number
  model: string
  error: string
}

/** AI 域 store：四要素提取（Step 5）。缓存键 = paperId + 模型 + 提示词版本（§4.4）。 */
export const useAiStore = defineStore('ai', {
  state: () => ({
    extract: {
      paperId: '',
      status: 'idle',
      buf: '',
      reasoningLen: 0,
      data: null,
      degraded: false,
      fromCache: false,
      cachedAt: 0,
      model: '',
      error: '',
    } as ExtractState,
  }),
  actions: {
    /** 打开文献时读缓存：命中则直接呈现，不再调用 */
    async loadCachedExtract(paperId: string) {
      const settings = useSettingsStore()
      await settings.ensureLoaded()
      const row = await dbGet<ExtractRow>('extracts', paperId)
      this.extract = {
        paperId,
        status: row ? 'done' : 'idle',
        buf: '',
        reasoningLen: 0,
        data: row
          ? {
              summary: row.summary,
              question: row.question,
              method: row.method,
              experiment: row.experiment,
              contribution: row.contribution ?? [],
              refs: row.refs ?? [],
              pages: row.pages,
            }
          : null,
        degraded: !!row?.degraded,
        fromCache: !!row,
        cachedAt: row?.createdAt ?? 0,
        model: row?.model ?? settings.effectiveAi.model,
        error: '',
      }
    },

    /** 一键提取（流式渲染 + 容错重试一次 + 纯文本降级 + 落缓存） */
    async runExtract(paperId: string, regenerate = false) {
      const library = useLibraryStore()
      const settings = useSettingsStore()
      const paper = library.papers.find((p) => p.id === paperId)
      if (!paper) return
      if (paper.textEmpty) {
        this.extract = { ...this.extract, status: 'error', error: '该文献为扫描版（无文本层），无法提取。' }
        return
      }

      if (!regenerate) {
        await this.loadCachedExtract(paperId)
        if (this.extract.status === 'done') return
      }

      const pages = await loadPageTexts(paperId)
      if (!pages.length) {
        this.extract = { ...this.extract, status: 'error', error: '未找到已解析的页面文本，请重新上传。' }
        return
      }

      await settings.ensureLoaded()
      const messages = buildExtractMessages(
        { title: paper.title, authors: paper.authors, year: paper.year, venue: paper.venue },
        pages.map((p) => ({ page: p.page, text: p.text })),
      )

      this.extract = {
        paperId,
        status: 'running',
        buf: '',
        reasoningLen: 0,
        data: null,
        degraded: false,
        fromCache: false,
        cachedAt: 0,
        model: settings.effectiveAi.model,
        error: '',
      }

      let pending: { role: 'assistant'; content: string } | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const msgs: ChatMessage[] = pending
            ? [
                ...messages,
                pending,
                { role: 'user', content: '上一次输出无法解析为 JSON。重新输出：只输出合法的 JSON 对象本身，不要任何其他字符。' },
              ]
            : messages
          const full = await chat(msgs, {
            temperature: 0.2,
            onDelta: (d) => {
              this.extract.buf += d
              const prog = streamProgressiveFields(this.extract.buf)
              this.extract.data = { ...(this.extract.data ?? ({} as ExtractResult)), ...prog } as ExtractResult
            },
            onReasoning: (d) => {
              this.extract.reasoningLen += d.length
            },
          })
          const parsed = parseExtractJson(full)
          if (!parsed && attempt === 0) {
            pending = { role: 'assistant', content: full }
            this.extract.buf = ''
            continue // 截断重试一次
          }
          const degraded = !parsed
          const data: ExtractResult =
            parsed ?? { summary: full.trim(), question: '', method: '', experiment: '', contribution: [], refs: [] }
          const row: ExtractRow = {
            paperId,
            model: settings.effectiveAi.model,
            promptVer: EXTRACT_PROMPT_VER,
            createdAt: Date.now(),
            degraded,
            ...data,
          }
          await dbPut('extracts', row)
          this.extract = {
            paperId,
            status: 'done',
            buf: full,
            reasoningLen: 0,
            data,
            degraded,
            fromCache: false,
            cachedAt: row.createdAt,
            model: row.model,
            error: '',
          }
          return
        } catch (e) {
          const msg = e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e)
          this.extract = { ...this.extract, status: 'error', error: msg }
          return
        }
      }
    },
  },
})
