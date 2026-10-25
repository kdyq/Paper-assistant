<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TextLayer } from 'pdfjs-dist'
import type { RenderTask } from 'pdfjs-dist'
import SelectionMenu from './SelectionMenu.vue'
import { useLibraryStore } from '../../stores/library'
import { useReaderStore } from '../../stores/reader'

const reader = useReaderStore()
const library = useLibraryStore()
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
</script>

<template>
  <article class="sheet pdf-sheet" data-anim="sheet" data-testid="pdf-sheet">
    <div class="venue" data-testid="pdf-page-indicator">
      {{ [paper?.venue, paper?.year].filter(Boolean).join(' · ') || paper?.fileName || '' }}
      · 论文页 {{ reader.pageNo }} / {{ reader.totalPages }}
    </div>
    <div ref="bodyEl" class="pdf-body">
      <div class="pdf-page" @mouseup="onMouseUp">
        <canvas ref="canvasEl" data-testid="pdf-canvas"></canvas>
        <div ref="textEl" class="pdf-textlayer" data-testid="pdf-textlayer"></div>
        <div v-if="reader.rendering" class="pdf-loading" data-testid="pdf-loading">
          <i class="ph ph-circle-notch spin"></i>
        </div>
      </div>
    </div>
    <div v-if="paper?.textEmpty" class="notice-bar">
      <i class="ph ph-warning-diamond"></i>
      <span>扫描版文献：无文本层，不支持选词与 AI 定位。</span>
    </div>
  </article>

  <teleport to="body">
    <SelectionMenu v-if="menu" :x="menu.x" :y="menu.y" :text="reader.selectedText" @close="menu = null" />
  </teleport>
</template>

<style scoped>
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
