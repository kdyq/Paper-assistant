import { defineStore } from 'pinia'
import { AiError, chat, type ChatMessage } from '../services/ai'
import {
  buildChatMessages,
  extractPageRefs,
  type ChatBrief,
} from '../services/chat'
import { dbGet, dbPut } from '../services/db'
import {
  EXTRACT_PROMPT_VER,
  buildExtractMessages,
  parseExtractJson,
  streamProgressiveFields,
  type ExtractResult,
} from '../services/extract'
import {
  GLOSSARY_PROMPT_VER,
  buildGlossaryMessages,
  parseGlossaryJson,
  type GlossaryItem,
} from '../services/glossary'
import { loadPageTexts, useLibraryStore } from './library'
import { useReaderStore } from './reader'
import { useSettingsStore } from './settings'

export interface ExtractRow extends ExtractResult {
  paperId: string
  model: string
  promptVer: string
  createdAt: number
  degraded?: boolean // JSON 解析失败降级为纯文本
}

export type ExtractStatus = 'idle' | 'running' | 'done' | 'error'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  refs: number[] // 回答中的 [P.x] 页码（Step 9 跳转用）
  ts: number
}

export interface ChatRow {
  paperId: string
  messages: ChatTurn[]
  updatedAt: number
}

export interface GlossaryRow {
  paperId: string
  model: string
  promptVer: string
  items: GlossaryItem[]
  createdAt: number
  degraded?: boolean
}

export type GlossaryStatus = 'idle' | 'running' | 'done' | 'error'

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

/** AI 域 store：四要素提取（Step 5）+ 伴读问答（Step 6）。缓存键 = paperId + 模型 + 提示词版本（§4.4）。 */
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
    chat: {
      paperId: '',
      messages: [] as ChatTurn[],
      status: 'idle' as 'idle' | 'running' | 'error',
      streaming: '', // 正在生成的回答
      reasoningLen: 0,
      error: '',
    },
    /** 问答 tab 聚焦信号（选区「解释/翻译」触发时切 tab） */
    chatFocusTick: 0,
    glossary: {
      paperId: '',
      status: 'idle' as GlossaryStatus,
      items: [] as GlossaryItem[],
      fromCache: false,
      cachedAt: 0,
      degraded: false,
      error: '',
    },
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

    // ================= 伴读问答（Step 6） =================

    /** 打开文献时加载会话历史（per-paper 持久化，刷新不丢） */
    async loadChat(paperId: string) {
      const row = await dbGet<ChatRow>('chats', paperId)
      this.chat = {
        paperId,
        messages: row?.messages ?? [],
        status: 'idle',
        streaming: '',
        reasoningLen: 0,
        error: '',
      }
    },

    async persistChat() {
      if (!this.chat.paperId) return
      const row: ChatRow = {
        paperId: this.chat.paperId,
        messages: this.chat.messages,
        updatedAt: Date.now(),
      }
      await dbPut('chats', row)
    },

    /** 发送问题：组装上下文 → 流式回答 → 落库。上下文见 services/chat.ts */
    async sendChat(question: string, selected?: { text: string; page: number }) {
      const q = question.trim()
      if (!q || !this.chat.paperId || this.chat.status === 'running') return
      const library = useLibraryStore()
      const reader = useReaderStore()
      const paper = library.papers.find((p) => p.id === this.chat.paperId)
      if (!paper) return

      const pages = await loadPageTexts(this.chat.paperId)
      if (!pages.length) {
        this.chat.status = 'error'
        this.chat.error = '未找到已解析的页面文本，无法回答。'
        return
      }

      this.chat.messages.push({ role: 'user', content: q, refs: [], ts: Date.now() })
      this.chat.status = 'running'
      this.chat.streaming = ''
      this.chat.reasoningLen = 0
      this.chat.error = ''

      const brief: ChatBrief = {
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        venue: paper.venue,
      }
      const ctx = {
        brief,
        summary: this.extract.paperId === paper.id ? this.extract.data?.summary : undefined,
        selected,
        currentPage: reader.paperId === paper.id ? reader.pageNo : undefined,
        pages: pages.map((p) => ({ page: p.page, text: p.text })),
        history: this.chat.messages
          .slice(0, -1)
          .filter((m) => m.content.trim())
          .map((m) => ({ role: m.role, content: m.content })),
        question: q,
      }
      const msgs: ChatMessage[] = buildChatMessages(ctx)

      try {
        const full = await chat(msgs, {
          temperature: 0.4,
          onDelta: (d) => {
            this.chat.streaming += d
          },
          onReasoning: (d) => {
            this.chat.reasoningLen += d.length
          },
        })
        this.chat.messages.push({ role: 'assistant', content: full, refs: extractPageRefs(full), ts: Date.now() })
        this.chat.streaming = ''
        this.chat.status = 'idle'
        await this.persistChat()
      } catch (e) {
        const msg = e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e)
        this.chat.streaming = ''
        this.chat.status = 'error'
        this.chat.error = msg
      }
    },

    /** 选区菜单入口：解释/翻译选中段落（切到问答 tab 并直接提问） */
    async askSelection(kind: 'explain' | 'translate', text: string, page: number) {
      const q =
        kind === 'explain'
          ? '请解释我选中的这段原文：它在讲什么？术语和逻辑给必要的展开。'
          : '请把我选中的这段原文完整翻译成中文（保留术语的通用译法）。'
      this.chatFocusTick++
      await this.sendChat(q, { text, page })
    },

    async clearChat(paperId: string) {
      this.chat = { paperId, messages: [], status: 'idle', streaming: '', reasoningLen: 0, error: '' }
      await dbPut('chats', { paperId, messages: [], updatedAt: Date.now() })
    },

    // ================= 术语表与符号表（Step 14） =================

    async loadGlossary(paperId: string) {
      const settings = useSettingsStore()
      await settings.ensureLoaded()
      const row = await dbGet<GlossaryRow>('glossary', paperId)
      this.glossary = {
        paperId,
        status: row ? 'done' : 'idle',
        items: row?.items ?? [],
        fromCache: !!row,
        cachedAt: row?.createdAt ?? 0,
        degraded: !!row?.degraded,
        error: '',
      }
    },

    async runGlossary(paperId: string, regenerate = false) {
      const library = useLibraryStore()
      const paper = library.papers.find((p) => p.id === paperId)
      if (!paper) return
      if (paper.textEmpty) {
        this.glossary = { ...this.glossary, status: 'error', error: '该文献为扫描版（无文本层），无法提取术语。' }
        return
      }
      if (!regenerate) {
        await this.loadGlossary(paperId)
        if (this.glossary.status === 'done') return
      }
      const pages = await loadPageTexts(paperId)
      if (!pages.length) {
        this.glossary = { ...this.glossary, status: 'error', error: '未找到页面文本，请重新上传。' }
        return
      }
      this.glossary = { paperId, status: 'running', items: [], fromCache: false, cachedAt: 0, degraded: false, error: '' }

      let pending: ChatMessage | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const settings = useSettingsStore()
          await settings.ensureLoaded()
          const base = buildGlossaryMessages(
            { title: paper.title },
            pages.map((p) => ({ page: p.page, text: p.text })),
          )
          const msgs: ChatMessage[] = pending
            ? [...base, pending, { role: 'user', content: '上一次输出无法解析为 JSON。重新输出：只输出合法的 JSON 对象本身。' }]
            : base
          const full = await chat(msgs, { temperature: 0.2 })
          const items = parseGlossaryJson(full)
          if (!items && attempt === 0) {
            pending = { role: 'assistant', content: full }
            continue
          }
          const degraded = !items
          const row: GlossaryRow = {
            paperId,
            model: settings.effectiveAi.model,
            promptVer: GLOSSARY_PROMPT_VER,
            items: items ?? [],
            createdAt: Date.now(),
            degraded,
          }
          await dbPut('glossary', row)
          this.glossary = {
            paperId,
            status: items ? 'done' : 'done',
            items: items ?? [],
            fromCache: false,
            cachedAt: row.createdAt,
            degraded,
            error: '',
          }
          return
        } catch (e) {
          const msg = e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e)
          this.glossary = { ...this.glossary, status: 'error', error: msg }
          return
        }
      }
    },
  },
})
