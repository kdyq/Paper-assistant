<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { ref } from 'vue'
import NoteDialog from '../common/NoteDialog.vue'
import { buildReadingCard, copyText, downloadText, safeFileName } from '../../services/export'
import { useAiStore } from '../../stores/ai'
import { useLibraryStore } from '../../stores/library'
import { useNotesStore, type Note } from '../../stores/notes'
import { useReaderStore } from '../../stores/reader'
import { useSettingsStore } from '../../stores/settings'
import { safeFrom } from '../../utils/anim'

// 右栏伴读面板：提取（Step 5）/ 问答（Step 6）/ 笔记（Step 7）
const settings = useSettingsStore()
const library = useLibraryStore()
const ai = useAiStore()
const notesStore = useNotesStore()
const reader = useReaderStore()
const tab = ref<'extract' | 'chat' | 'notes' | 'glossary'>('extract')
const chatInput = ref('')

const paper = computed(() => library.current)
const ex = computed(() => ai.extract)
const chat = computed(() => ai.chat)
const chatRunning = computed(() => chat.value.status === 'running')
const notesList = computed(() => notesStore.current)
const gl = computed(() => ai.glossary)

watch(
  () => library.currentId,
  (id) => {
    if (id) {
      void ai.loadCachedExtract(id)
      void ai.loadChat(id)
      void notesStore.load(id)
      void ai.loadGlossary(id)
    }
  },
  { immediate: true },
)

/* 选区「解释/翻译」→ 切到问答 tab */
watch(
  () => ai.chatFocusTick,
  () => {
    tab.value = 'chat'
  },
)

/* 新建笔记成功 → 切到笔记 tab */
watch(
  () => notesStore.focusTick,
  () => {
    tab.value = 'notes'
  },
)

/* 问答自动滚底 */
watch(
  () => [chat.value.messages.length, chat.value.streaming.length, chat.value.reasoningLen, tab.value] as const,
  async () => {
    if (tab.value !== 'chat') return
    await nextTick()
    const body = document.querySelector('.tab-body')
    if (body) body.scrollTop = body.scrollHeight
  },
)

const TABS = [
  { key: 'extract', label: '提取' },
  { key: 'chat', label: '问答' },
  { key: 'notes', label: '笔记' },
  { key: 'glossary', label: '术语' },
] as const

const CARDS = [
  { key: 'question', num: '一', title: '研究问题' },
  { key: 'method', num: '二', title: '核心方法' },
  { key: 'experiment', num: '三', title: '实验结果' },
  { key: 'contribution', num: '四', title: '主要贡献' },
] as const

const cardPage = (k: string) => {
  const p = ex.value.data?.pages?.[k]
  return p ? `P.${p}` : ''
}

const cachedTimeText = computed(() => {
  if (!ex.value.cachedAt) return ''
  const d = new Date(ex.value.cachedAt)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString()
})

function runExtract(regen = false) {
  if (!paper.value) return
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('[data-pane="extract"] .extract-card')
    if (cards.length) safeFrom(cards, { y: 6, autoAlpha: 0, duration: 0.25, stagger: 0.03 })
  })
  void ai.runExtract(paper.value.id, regen)
}

function switchTab(key: 'extract' | 'chat' | 'notes' | 'glossary') {
  if (tab.value === key) return
  tab.value = key
  requestAnimationFrame(() => {
    const pane = document.querySelector(`[data-pane="${key}"]`)
    if (pane) safeFrom(pane.children, { y: 8, autoAlpha: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' })
  })
}

/* 术语表（Step 14） */
function runGlossary(regen = false) {
  if (!paper.value) return
  void ai.runGlossary(paper.value.id, regen)
}

function jumpGlossary(item: { name: string; page: number }) {
  void reader.jumpWithHighlight(item.page, item.name)
}

function sendFromInput() {
  const q = chatInput.value
  if (!q.trim() || chatRunning.value || !paper.value) return
  chatInput.value = ''
  void ai.sendChat(q)
}

/* ---------- 笔记（Step 7） ---------- */
const noteEditing = ref<Note | null>(null) // 编辑态
const noteCreating = ref(false) // 全局新建态

function openCreateNote() {
  if (!paper.value) return
  noteCreating.value = true
}

async function saveCreateNote(data: { content: string; quote: string }) {
  if (!paper.value) return
  await notesStore.create(paper.value.id, { page: 0, quote: data.quote, content: data.content })
  noteCreating.value = false
}

async function saveEditNote(data: { content: string; quote: string }) {
  if (!noteEditing.value) return
  await notesStore.update(noteEditing.value.id, { content: data.content, quote: data.quote })
  noteEditing.value = null
}

function jumpNote(n: Note) {
  if (n.page > 0) void reader.jumpWithHighlight(n.page, n.quote)
}

/* ---------- 精读卡片导出（Step 12） ---------- */
const exportMsg = ref('')

async function exportCard(kind: 'copy' | 'download') {
  if (!paper.value) return
  const exRow = ex.value.data
    ? { ...ex.value.data, degraded: ex.value.degraded }
    : null
  const md = buildReadingCard(paper.value, exRow, notesList.value)
  if (kind === 'download') {
    downloadText(`精读卡片_${safeFileName(paper.value.title)}.md`, md)
    exportMsg.value = '已下载'
  } else {
    exportMsg.value = (await copyText(md)) ? '已复制到剪贴板' : '复制失败（浏览器限制），请用下载'
  }
  setTimeout(() => (exportMsg.value = ''), 2000)
}

function fmtNoteTime(ts: number): string {
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

/* ---------- 引用定位跳转（Step 9） ---------- */

/** 提取卡出处点击：跳到要素页码；refs 中有对应原文引文则尝试高亮 */
function jumpExtract(key: string) {
  const page = ex.value.data?.pages?.[key]
  if (!page) return
  const quote = ex.value.data?.refs?.find((r) => r.page === page)?.quote ?? ''
  void reader.jumpWithHighlight(page, quote)
}

/** 从回答文本中取 [P.x] 前邻近语句作为高亮候选（多为译文，匹配失败自然降级为仅跳页） */
function quoteNearRef(content: string, refPage: number): string {
  const re = new RegExp(`\\[P\\.${refPage}\\]`, 'g')
  const m = re.exec(content)
  if (!m || m.index === 0) return ''
  const before = content.slice(Math.max(0, m.index - 60), m.index)
  const cut = Math.max(before.lastIndexOf('。'), before.lastIndexOf('；'), before.lastIndexOf('\n'), -1)
  const frag = (cut >= 0 ? before.slice(cut + 1) : before).replace(/[""「」'']/g, '').trim()
  return frag.length >= 6 ? frag.slice(0, 80) : ''
}

function jumpChatRef(content: string, refPage: number) {
  void reader.jumpWithHighlight(refPage, quoteNearRef(content, refPage))
}
</script>

<template>
  <aside class="ai-panel">
    <div class="ai-head" data-anim="aihead">
      <div class="ai-head-top">
        <span class="ai-head-title">伴读</span>
        <span class="model-chip" data-testid="model-chip">{{ settings.effectiveAi.model || '未配置模型' }}</span>
      </div>
      <div class="ai-head-sub">{{ paper ? paper.title : '对当前论文提问，回答附原文定位' }}</div>
    </div>
    <nav class="ai-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="ai-tab"
        :class="{ active: tab === t.key }"
        :data-testid="`tab-${t.key}`"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </nav>
    <div class="tab-body">
      <!-- ============ 提取 ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'extract' }" data-pane="extract">
        <!-- 无文献 -->
        <template v-if="!paper">
          <div v-for="c in CARDS" :key="c.num" class="extract-card" data-anim="card">
            <div class="extract-head">
              <span class="extract-num">{{ c.num }}</span><span class="extract-title">{{ c.title }}</span>
            </div>
            <div class="extract-text muted">打开文献后，一键提取{{ c.title }}要点。</div>
          </div>
        </template>

        <!-- 扫描版 -->
        <div v-else-if="paper.textEmpty && ex.status === 'idle'" class="notice-bar">
          <i class="ph ph-warning-diamond"></i>
          <span>扫描版文献无文本层，暂不支持 AI 提取（阅读不受影响）。</span>
        </div>

        <!-- 待提取 -->
        <template v-else-if="ex.status === 'idle'">
          <div class="extract-hero" data-testid="extract-hero">
            <i class="ph ph-sparkle"></i>
            <div class="t">一键提取四要素</div>
            <div class="s">研究问题 · 核心方法 · 实验结果 · 主要贡献<br />每项附原文页码出处</div>
            <button class="btn btn-primary" data-testid="btn-extract" @click="runExtract(false)">
              <i class="ph ph-magic-wand"></i> 开始提取
            </button>
          </div>
        </template>

        <!-- 生成中 / 完成 -->
        <template v-else>
          <div v-if="ex.status === 'running'" class="extract-status" data-testid="extract-status">
            <i class="ph ph-circle-notch spin"></i>
            <template v-if="ex.buf.length">朱笔批注中 · {{ ex.buf.length }} 字</template>
            <template v-else-if="ex.reasoningLen">研读原文中 · {{ ex.reasoningLen }} 字</template>
            <template v-else>研读原文中…</template>
          </div>
          <div v-else-if="ex.status === 'error'" class="notice-bar" data-testid="extract-error">
            <i class="ph ph-warning-circle"></i>
            <span>{{ ex.error }}</span>
            <i class="ph ph-arrow-clockwise close" title="重试" @click="runExtract(true)"></i>
          </div>

          <!-- 摘要卡 -->
          <div v-if="ex.data?.summary" class="extract-card" data-anim="card">
            <div class="extract-head">
              <span class="extract-title">摘要</span>
              <span class="extract-loc">{{ cardPage('summary') }}</span>
            </div>
            <div class="extract-text" data-testid="extract-summary">{{ ex.data.summary }}</div>
          </div>

          <!-- 四要素卡 -->
          <div v-for="c in CARDS" :key="c.key" class="extract-card" data-anim="card" :data-testid="`card-${c.key}`">
            <div class="extract-head">
              <span class="extract-num">{{ c.num }}</span>
              <span class="extract-title">{{ c.title }}</span>
              <button
                v-if="cardPage(c.key)"
                class="extract-loc loc-btn"
                :data-testid="`loc-${c.key}`"
                title="跳转原文"
                @click="jumpExtract(c.key)"
              >
                {{ cardPage(c.key) }}
              </button>
              <span v-else class="extract-loc" :data-testid="`loc-${c.key}`">{{ ex.status === 'running' ? '…' : '' }}</span>
            </div>
            <div v-if="c.key === 'contribution'" class="extract-text">
              <ol v-if="ex.data?.contribution?.length">
                <li v-for="(item, i) in ex.data.contribution" :key="i">{{ item }}</li>
              </ol>
              <div v-else-if="ex.status === 'running'" class="muted">批注中▍</div>
            </div>
            <div v-else class="extract-text">
              <span v-if="(ex.data as Record<string, unknown>)?.[c.key]" :data-testid="`text-${c.key}`">{{ (ex.data as Record<string, unknown>)[c.key] }}</span>
              <span v-else-if="ex.status === 'running'" class="muted">批注中▍</span>
            </div>
          </div>

          <!-- 完成态脚注 -->
          <div v-if="ex.status === 'done'" class="extract-foot" data-testid="extract-foot">
            <span v-if="ex.degraded" class="warn" data-testid="extract-degraded"><i class="ph ph-warning"></i> 结构化解析失败，已降级为纯文本</span>
            <span v-else class="muted">
              {{ ex.fromCache ? '缓存' : '已生成' }}<template v-if="cachedTimeText"> · {{ cachedTimeText }}</template> · {{ ex.model }}
            </span>
            <button class="tag-add" data-testid="btn-export-copy" title="复制 Markdown 精读卡片" @click="exportCard('copy')">
              <i class="ph ph-copy-simple" style="font-size: 9px"></i> 复制卡片
            </button>
            <button class="tag-add" data-testid="btn-export-download" title="下载 .md 精读卡片" @click="exportCard('download')">
              <i class="ph ph-download-simple" style="font-size: 9px"></i> 下载卡片
            </button>
            <button class="tag-add" data-testid="btn-regen" title="重新生成（不计缓存）" @click="runExtract(true)">
              <i class="ph ph-arrow-counter-clockwise" style="font-size: 9px"></i> 重新生成
            </button>
            <span v-if="exportMsg" class="export-msg" data-testid="export-msg">{{ exportMsg }}</span>
          </div>
        </template>
      </div>

      <!-- ============ 问答（Step 6） ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'chat' }" data-pane="chat">
        <!-- 清空 -->
        <div v-if="chat.messages.length" class="chat-clear">
          <button class="tag-add" data-testid="btn-clear-chat" @click="paper && ai.clearChat(paper.id)">
            <i class="ph ph-broom" style="font-size: 9px"></i> 清空会话
          </button>
        </div>

        <!-- 空态引导 -->
        <div v-if="!chat.messages.length && !chatRunning" class="chat-item" data-anim="card">
          <div class="chat-avatar ai"><i class="ph ph-pen-nib"></i></div>
          <div class="chat-bubble">
            <div class="who">伴读</div>
            <div class="txt">
              {{ paper ? '就当前论文提问，回答附 [P.x] 原文定位。也可在左侧选中原文后「解释这段 / 翻译这段」。' : '打开一篇文献后即可提问。' }}
            </div>
          </div>
        </div>

        <!-- 历史消息 -->
        <div v-for="(m, i) in chat.messages" :key="m.ts + '-' + i" class="chat-item" :data-testid="`chat-msg-${m.role}`">
          <div class="chat-avatar" :class="m.role">
            <i :class="m.role === 'user' ? 'ph ph-user' : 'ph ph-pen-nib'"></i>
          </div>
          <div class="chat-bubble">
            <div class="who">{{ m.role === 'user' ? '我' : '伴读' }}</div>
            <div class="txt">{{ m.content }}</div>
            <div v-if="m.role === 'assistant' && m.refs.length" class="refs-line">
              <button
                v-for="r in m.refs"
                :key="r"
                class="ref-chip"
                :data-testid="`chat-ref-${r}`"
                title="跳转原文"
                @click="jumpChatRef(m.content, r)"
              >
                P.{{ r }}
              </button>
            </div>
          </div>
        </div>

        <!-- 流式中 -->
        <div v-if="chatRunning" class="chat-item" data-testid="chat-streaming">
          <div class="chat-avatar ai"><i class="ph ph-pen-nib"></i></div>
          <div class="chat-bubble">
            <div class="who">伴读</div>
            <div v-if="chat.streaming" class="txt">{{ chat.streaming }}<span class="caret">▍</span></div>
            <div v-else class="txt muted">{{ chat.reasoningLen ? `研读原文中 · ${chat.reasoningLen} 字` : '研读原文中…' }}</div>
          </div>
        </div>

        <!-- 错误 -->
        <div v-if="chat.status === 'error'" class="notice-bar" data-testid="chat-error">
          <i class="ph ph-warning-circle"></i>
          <span>{{ chat.error }}</span>
        </div>
      </div>

      <!-- ============ 笔记（Step 7） ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'notes' }" data-pane="notes">
        <div v-if="paper" class="chat-clear">
          <button class="tag-add" data-testid="btn-new-note" @click="openCreateNote">
            <i class="ph ph-plus" style="font-size: 9px"></i> 新建全局笔记
          </button>
        </div>

        <!-- 空态 -->
        <div v-if="!notesList.length" class="note-card" data-anim="card">
          <div class="note-head"><i class="ph ph-bookmark-simple"></i>笔记</div>
          <div class="note-text muted">
            {{ paper ? '阅读时选中文本即可记笔记，笔记锚定页码与引文，点击可跳回原文。' : '打开文献后即可记笔记。' }}
          </div>
        </div>

        <!-- 列表 -->
        <div
          v-for="n in notesList"
          :key="n.id"
          class="note-card"
          :class="{ clickable: n.page > 0 }"
          :data-testid="`note-${n.id}`"
          @click="jumpNote(n)"
        >
          <div class="note-head">
            <i class="ph ph-bookmark-simple"></i>
            <span>{{ n.page > 0 ? `锚定 P.${n.page}` : '全局' }}</span>
            <span class="note-time">{{ fmtNoteTime(n.updatedAt) }}</span>
            <span class="note-actions">
              <i class="ph ph-pencil-simple note-act" title="编辑" @click.stop="noteEditing = n"></i>
              <i class="ph ph-trash note-act" title="删除" @click.stop="notesStore.remove(n.id)"></i>
            </span>
          </div>
          <div v-if="n.quote" class="note-quote">"{{ n.quote }}"</div>
          <div class="note-text" data-testid="note-content-text">{{ n.content }}</div>
        </div>
      </div>

      <!-- ============ 术语表与符号表（Step 14） ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'glossary' }" data-pane="glossary">
        <!-- 空态 / 待生成 -->
        <template v-if="gl.status === 'idle'">
          <div class="extract-hero" data-testid="glossary-hero">
            <i class="ph ph-book-open-text"></i>
            <div class="t">术语表与符号表</div>
            <div class="s">AI 提取方法/概念术语与数学符号<br />每条附释义与原文页码，可一键回文</div>
            <button v-if="paper && !paper.textEmpty" class="btn btn-primary" data-testid="btn-glossary" @click="runGlossary(false)">
              <i class="ph ph-magic-wand"></i> 开始提取
            </button>
            <div v-else class="s" style="margin-top: 8px">{{ paper ? '扫描版文献暂不支持。' : '先打开一篇文献。' }}</div>
          </div>
        </template>

        <template v-else>
          <div v-if="gl.status === 'running'" class="extract-status" data-testid="glossary-status">
            <i class="ph ph-circle-notch spin"></i> 收录词条中…
          </div>
          <div v-else-if="gl.status === 'error'" class="notice-bar" data-testid="glossary-error">
            <i class="ph ph-warning-circle"></i><span>{{ gl.error }}</span>
            <i class="ph ph-arrow-clockwise close" title="重试" @click="runGlossary(true)"></i>
          </div>

          <div
            v-for="(it, i) in gl.items"
            :key="it.kind + it.name + i"
            class="extract-card glossary-card"
            :data-testid="`gl-card-${i}`"
          >
            <div class="extract-head">
              <span v-if="it.kind === 'symbol'" class="gl-kind gl-symbol" title="符号">符</span>
              <span v-else class="gl-kind" title="术语">术</span>
              <span class="extract-title gl-name">{{ it.name }}</span>
              <button class="extract-loc loc-btn" :data-testid="`gl-loc-${i}`" title="跳转原文" @click="jumpGlossary(it)">
                P.{{ it.page }}
              </button>
            </div>
            <div class="extract-text">{{ it.definition }}</div>
          </div>

          <div v-if="gl.status === 'done'" class="extract-foot" data-testid="glossary-foot">
            <span class="muted">
              {{ gl.items.length }} 条{{ gl.fromCache ? ' · 缓存' : ' · 已生成' }}
              <template v-if="gl.degraded"> · 解析降级</template>
            </span>
            <button class="tag-add" data-testid="btn-glossary-regen" @click="runGlossary(true)">
              <i class="ph ph-arrow-counter-clockwise" style="font-size: 9px"></i> 重新生成
            </button>
          </div>
        </template>
      </div>
    </div>
    <div class="ai-input">
      <div class="ai-input-box">
        <input
          v-model="chatInput"
          :placeholder="paper ? '就当前论文提问…' : '打开文献后可提问'"
          :disabled="!paper"
          data-testid="chat-input"
          @keyup.enter="sendFromInput"
        />
        <i
          class="ph ph-paper-plane-right send"
          :class="{ disabled: !paper || chatRunning }"
          data-testid="chat-send"
          @click="sendFromInput"
        ></i>
      </div>
      <div class="ai-input-hint">
        {{ chatRunning ? '伴读批注中…' : '选中左侧原文后，可直接「解释这段 / 翻译这段」' }}
      </div>
    </div>

    <!-- 全局新建笔记 -->
    <NoteDialog v-if="noteCreating" @close="noteCreating = false" @save="saveCreateNote" />
    <!-- 编辑笔记 -->
    <NoteDialog
      v-if="noteEditing"
      :page="noteEditing.page"
      :quote="noteEditing.quote"
      :content="noteEditing.content"
      :editing-id="noteEditing.id"
      @close="noteEditing = null"
      @save="saveEditNote"
    />
  </aside>
</template>

<style scoped>
.muted {
  color: var(--ink-3);
}
.caret {
  color: var(--accent);
}
.chat-clear {
  text-align: right;
  margin-bottom: 6px;
}
.refs-line {
  margin-top: 5px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.ref-chip {
  font-size: 10px;
  color: var(--accent-deep);
  border: 1px solid var(--accent);
  background: var(--accent-wash);
  border-radius: 3px;
  padding: 0 6px;
}
.send.disabled {
  opacity: 0.35;
  cursor: default;
}
.note-card.clickable {
  cursor: pointer;
}
.note-card.clickable:hover {
  border-color: var(--accent);
}
.note-time {
  margin-left: auto;
}
.note-actions {
  display: flex;
  gap: 5px;
  opacity: 0;
  transition: opacity 0.15s;
}
.note-card:hover .note-actions {
  opacity: 1;
}
.note-act {
  cursor: pointer;
  color: var(--ink-3);
  font-size: 12px;
}
.note-act:hover {
  color: var(--accent-deep);
}
.note-quote {
  font-size: 11.5px;
  color: var(--ink-3);
  border-left: 2px solid var(--accent);
  background: var(--surface);
  border-radius: 3px;
  padding: 5px 9px;
  margin-bottom: 6px;
  line-height: 1.6;
}
.gl-kind {
  font-size: 9.5px;
  color: var(--ink-2);
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 3px;
  padding: 0 5px;
  flex-shrink: 0;
}
.gl-kind.gl-symbol {
  color: var(--accent-deep);
  border-color: var(--accent);
  background: var(--accent-wash);
}
.gl-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.extract-hero {
  text-align: center;
  padding: 30px 12px 22px;
  border: 1px dashed var(--line);
  border-radius: 3px;
  color: var(--ink-3);
}
.extract-hero i {
  font-size: 26px;
  color: var(--accent);
}
.extract-hero .t {
  font-family: var(--font-serif);
  font-size: 15px;
  color: var(--ink);
  margin: 8px 0 6px;
  letter-spacing: 0.06em;
}
.extract-hero .s {
  font-size: 11.5px;
  line-height: 1.9;
  margin-bottom: 14px;
}
.extract-status {
  font-size: 12px;
  color: var(--accent-deep);
  background: var(--accent-wash);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 6px 12px;
  margin-bottom: 10px;
}
.extract-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 10.5px;
}
.extract-foot .warn {
  color: var(--accent-deep);
}
.extract-foot .tag-add {
  margin-left: auto;
}
.extract-foot .tag-add + .tag-add {
  margin-left: 0;
}
.export-msg {
  color: var(--accent-deep);
}
</style>
