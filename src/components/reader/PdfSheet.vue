<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TextLayer } from 'pdfjs-dist'
import type { RenderTask } from 'pdfjs-dist'
import NoteDialog from '../common/NoteDialog.vue'
import FormulaDialog from '../formula/FormulaDialog.vue'
import FigureDialog from '../formula/FigureDialog.vue'
import SelectionMenu from './SelectionMenu.vue'
import { useAiStore } from '../../stores/ai'
import { useLibraryStore } from '../../stores/library'
import { useNotesStore } from '../../stores/notes'
import { useReaderStore } from '../../stores/reader'
import { flashQuoteInTextLayer } from '../../utils/highlight'

const reader = useReaderStore()
const library = useLibraryStore()
const ai = useAiStore()
const notes = useNotesStore()
const paper = computed(() => library.current)

const bodyEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const textEl = ref<HTMLElement | null>(null)

let renderTask: RenderTask | null = null
let renderToken = 0
let resizeRaf = 0
let ro: ResizeObserver | null = null

async function renderPage() {
  const doc = reader.doc
  const canvas = canvasEl.value
  const body = bodyEl.value
  const layer = textEl.value
  if (!doc || !canvas || !body || !layer) return

  const token = ++renderToken
  reader.rendering = true
  try {
    const page = await doc.getPage(reader.pageNo)
    if (token !== renderToken) return

    const base = page.getViewport({ scale: 1 })
    const fit = body.clientWidth / base.width
    const scale = fit * reader.zoom
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    renderTask?.cancel()
    renderTask = page.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    })
    await renderTask.promise
    if (token !== renderToken) return

    // 文本层（可选择，供选区菜单与后续引用定位）
    layer.textContent = ''
    layer.style.width = `${Math.floor(viewport.width)}px`
    layer.style.height = `${Math.floor(viewport.height)}px`
    layer.style.setProperty('--scale-factor', String(viewport.scale))
    const content = await page.getTextContent()
    if (token !== renderToken) return
    const tl = new TextLayer({ textContentSource: content, container: layer, viewport })
    await tl.render()
  } catch (e) {
    const name = (e as { name?: string })?.name ?? ''
    if (name !== 'RenderingCancelledException' && !/cancel/i.test(String(e))) {
      reader.error = e instanceof Error ? e.message : String(e)
    }
  } finally {
    if (token === renderToken) reader.rendering = false
  }
}

function scrollToTop() {
  document.querySelector('.reading')?.scrollTo({ top: 0 })
}

watch(
  () => [reader.paperId, reader.pageNo, reader.zoom, reader.ready] as const,
  () => {
    void renderPage()
    if (reader.paperId) scrollToTop()
  },
)

/* 适应宽度：容器尺寸变化时重渲染（含窗口缩放） */
function onResize() {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    setTimeout(() => {
      if (reader.ready) void renderPage()
    }, 120)
  })
}

onMounted(() => {
  if (bodyEl.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(onResize)
    ro.observe(bodyEl.value)
  }
  document.addEventListener('mousedown', onDocMouseDown)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  renderTask?.cancel()
  document.removeEventListener('mousedown', onDocMouseDown)
})

/* ---------- 选区菜单 ---------- */
const menu = ref<{ x: number; y: number } | null>(null)

function onMouseUp() {
  const sel = window.getSelection()
  const layer = textEl.value
  if (!sel || sel.isCollapsed || !layer) {
    menu.value = null
    return
  }
  const text = sel.toString().trim()
  const anchor = sel.anchorNode
  if (!text || text.length < 2 || !anchor || !layer.contains(anchor)) {
    menu.value = null
    return
  }
  reader.setSelection(text, reader.pageNo)
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  menu.value = { x: rect.left + rect.width / 2, y: rect.top }
}

function onDocMouseDown(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (menu.value && !t.closest('.sel-menu') && !t.closest('.pdf-textlayer')) {
    menu.value = null
  }
}

/** 选区菜单动作：解释/翻译 → 伴读问答；记笔记 → 弹层；公式 → 公式解释 */
function onSelAction(kind: 'explain' | 'translate' | 'note' | 'formula') {
  const text = reader.selectedText
  const page = reader.selectedPage
  menu.value = null
  if (!text || !paper.value) return
  if (kind === 'note') {
    noteDraft.value = { page, quote: text.slice(0, 400) }
    return
  }
  if (kind === 'formula') {
    formulaDraft.value = { text, page }
    return
  }
  void ai.askSelection(kind, text, page)
}

/* ---------- 公式解释（Step 10） ---------- */
const formulaDraft = ref<{ text: string; page: number } | null>(null)

/* ---------- 框选图表（Step 11） ---------- */
const figureDraft = ref<{ image: string; page: number } | null>(null)
const drag = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const pageEl = ref<HTMLElement | null>(null)

/** 依据拖拽矩形从渲染 canvas 裁剪截图（长边 ≤1280，JPEG 压缩） */
function cropCanvas(): string | null {
  const canvas = canvasEl.value
  const box = pageEl.value
  if (!canvas || !box || !drag.value) return null
  const boxRect = box.getBoundingClientRect()
  const x0 = Math.min(drag.value.x0, drag.value.x1) - boxRect.left
  const y0 = Math.min(drag.value.y0, drag.value.y1) - boxRect.top
  const x1 = Math.max(drag.value.x0, drag.value.x1) - boxRect.left
  const y1 = Math.max(drag.value.y0, drag.value.y1) - boxRect.top
  const w = x1 - x0
  const h = y1 - y0
  if (w < 30 || h < 30) return null
  const dpr = canvas.width / (parseFloat(canvas.style.width) || canvas.clientWidth || 1)
  const sx = Math.max(0, Math.round(x0 * dpr))
  const sy = Math.max(0, Math.round(y0 * dpr))
  const sw = Math.min(canvas.width - sx, Math.round(w * dpr))
  const sh = Math.min(canvas.height - sy, Math.round(h * dpr))
  if (sw < 20 || sh < 20) return null
  const scale = Math.min(1, 1280 / Math.max(sw, sh))
  const off = document.createElement('canvas')
  off.width = Math.round(sw * scale)
  off.height = Math.round(sh * scale)
  const ctx = off.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, off.width, off.height)
  return off.toDataURL('image/jpeg', 0.9)
}

function onRegionDown(e: MouseEvent) {
  if (!reader.regionMode) return
  e.preventDefault()
  drag.value = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }
}
function onRegionMove(e: MouseEvent) {
  if (!drag.value) return
  drag.value = { ...drag.value, x1: e.clientX, y1: e.clientY }
}
function onRegionUp() {
  if (!drag.value) return
  const image = cropCanvas()
  drag.value = null
  reader.regionMode = false
  if (image) figureDraft.value = { image, page: reader.pageNo }
}

const dragStyle = computed(() => {
  if (!drag.value) return {}
  const x = Math.min(drag.value.x0, drag.value.x1)
  const y = Math.min(drag.value.y0, drag.value.y1)
  const w = Math.abs(drag.value.x1 - drag.value.x0)
  const h = Math.abs(drag.value.y1 - drag.value.y0)
  return { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }
})

function onRegionKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && reader.regionMode) {
    reader.regionMode = false
    drag.value = null
  }
}

onMounted(() => {
  document.addEventListener('keydown', onRegionKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onRegionKey)
})

/* ---------- 笔记 ---------- */
const noteDraft = ref<{ page: number; quote: string } | null>(null)

async function saveNote(data: { content: string; quote: string }) {
  if (!paper.value || !noteDraft.value) return
  await notes.create(paper.value.id, {
    page: noteDraft.value.page,
    quote: data.quote,
    content: data.content,
  })
  noteDraft.value = null
  notes.focusTick++ // 让伴读面板切到笔记 tab
}

/* ---------- 引用/笔记跳转高亮 ---------- */
watch(
  () => reader.highlightTick,
  async () => {
    const quote = reader.highlightQuote
    if (!quote) return
    // 等渲染完成后高亮（跳页时会有一次重渲染；跨视图跳转时组件可能晚于信号挂载）
    const t0 = Date.now()
    while (reader.rendering && Date.now() - t0 < 3000) {
      await new Promise((r) => setTimeout(r, 120))
    }
    await new Promise((r) => setTimeout(r, 150))
    if (textEl.value) flashQuoteInTextLayer(textEl.value, quote)
    reader.highlightQuote = ''
  },
  { immediate: true },
)

const selWrapStyle = computed(() => ({
  left: `${Math.min(Math.max(menu.value?.x ?? 0, 110), window.innerWidth - 110)}px`,
  top: `${Math.max(menu.value?.y ?? 0, 8) - 44}px`,
}))
</script>

<template>
  <article class="sheet pdf-sheet" data-anim="sheet" data-testid="pdf-sheet">
    <div class="venue" data-testid="pdf-page-indicator">
      {{ [paper?.venue, paper?.year].filter(Boolean).join(' · ') || paper?.fileName || '' }}
      · 论文页 {{ reader.pageNo }} / {{ reader.totalPages }}
    </div>
    <div ref="bodyEl" class="pdf-body">
      <div ref="pageEl" class="pdf-page" :class="{ 'region-mode': reader.regionMode }" @mouseup="onMouseUp">
        <canvas ref="canvasEl" data-testid="pdf-canvas"></canvas>
        <div ref="textEl" class="pdf-textlayer" data-testid="pdf-textlayer"></div>
        <div v-if="reader.rendering" class="pdf-loading" data-testid="pdf-loading">
          <i class="ph ph-circle-notch spin"></i>
        </div>
      </div>
    </div>
    <!-- 框选遮罩（fixed 全视口，承载拖拽事件） -->
    <teleport to="body">
      <div
        v-if="reader.regionMode"
        class="region-mask"
        data-testid="region-mask"
        @mousedown="onRegionDown"
        @mousemove="onRegionMove"
        @mouseup="onRegionUp"
      >
        <div v-if="drag" class="region-rect" :style="dragStyle"></div>
        <div class="region-tip"><i class="ph ph-crop"></i> 拖拽框选图表区域，Esc 取消</div>
      </div>
    </teleport>
    <div v-if="paper?.textEmpty" class="notice-bar">
      <i class="ph ph-warning-diamond"></i>
      <span>扫描版文献：无文本层，不支持选词与 AI 定位。</span>
    </div>
  </article>

  <teleport to="body">
    <div
      v-if="menu"
      class="sel-menu-wrap"
      :style="selWrapStyle"
    >
      <SelectionMenu :text="reader.selectedText" @action="onSelAction" />
    </div>
    <NoteDialog
      v-if="noteDraft"
      :page="noteDraft.page"
      :quote="noteDraft.quote"
      @close="noteDraft = null"
      @save="saveNote"
    />
    <FormulaDialog
      v-if="formulaDraft"
      :text="formulaDraft.text"
      :page="formulaDraft.page"
      @close="formulaDraft = null"
    />
    <FigureDialog
      v-if="figureDraft"
      :image="figureDraft.image"
      :page="figureDraft.page"
      @close="figureDraft = null"
      @saved="notes.focusTick++"
    />
  </teleport>
</template>

<style scoped>
.sel-menu-wrap {
  position: fixed;
  transform: translateX(-50%);
  z-index: 60;
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
</style>
