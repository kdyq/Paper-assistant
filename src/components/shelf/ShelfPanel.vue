<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MetaDialog from '../common/MetaDialog.vue'
import { useLibraryStore, type Paper, type PaperStatus } from '../../stores/library'
import { safeFrom } from '../../utils/anim'

const library = useLibraryStore()
const router = useRouter()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const showMetaFor = ref<string | null>(null)
const tagInputFor = ref<string | null>(null)
const tagDraft = ref('')
const confirmDeleteFor = ref<string | null>(null)

const STATUS_LABEL: Record<PaperStatus, string> = {
  unread: '未读',
  reading: '在读',
  done: '已读',
}
const STATUS_CLASS: Record<PaperStatus, string> = {
  unread: 'status-todo',
  reading: 'status-reading',
  done: 'status-done',
}
const NEXT_STATUS: Record<PaperStatus, PaperStatus> = {
  unread: 'reading',
  reading: 'done',
  done: 'unread',
}

const metaPaper = computed(() => library.papers.find((p) => p.id === showMetaFor.value))

function pickFiles() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void library.importFiles(input.files)
  input.value = ''
}

/* 全窗口拖拽 */
let dragDepth = 0
function onDragEnter(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragging.value = true
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  if (e.dataTransfer?.files?.length) void library.importFiles(e.dataTransfer.files)
}
onMounted(() => {
  void library.load()
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
})
onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})

async function openPaper(p: Paper) {
  await library.openPaper(p.id)
  router.push('/')
  requestAnimationFrame(() => {
    const sheet = document.querySelector('[data-anim="sheet"]')
    if (sheet) safeFrom(sheet, { y: 10, autoAlpha: 0, duration: 0.3 })
  })
}

function cycleStatus(p: Paper) {
  void library.setStatus(p.id, NEXT_STATUS[p.status])
}

function startTagAdd(p: Paper) {
  tagInputFor.value = p.id
  tagDraft.value = ''
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('.tag-input')
    el?.focus()
  })
}

function commitTag(p: Paper) {
  if (tagDraft.value.trim()) void library.addTag(p.id, tagDraft.value)
  tagInputFor.value = null
}

function dismissError() {
  library.importError = ''
  if (library.importPhase === 'error') library.importPhase = 'idle'
}

function editMeta(p: Paper) {
  showMetaFor.value = p.id
}

async function saveMeta(patch: Partial<Paper>) {
  if (!metaPaper.value) return
  await library.updateMeta(metaPaper.value.id, patch)
  showMetaFor.value = null
}

async function doDelete() {
  if (!confirmDeleteFor.value) return
  await library.remove(confirmDeleteFor.value)
  confirmDeleteFor.value = null
}
</script>

<template>
  <div class="lib-head">
    <span class="lib-title">书架</span><span class="lib-count">{{ library.papers.length }} 篇</span>
  </div>

  <!-- 导入三态 -->
  <div v-if="library.importPhase === 'parsing' || library.importPhase === 'saving'" class="import-bar" data-testid="import-bar">
    <i class="ph ph-spinner"></i>
    {{ library.importPhase === 'parsing' ? '解析中' : '写入本机' }}：<span class="name">{{ library.importFile }}</span>
    <div class="import-track"><div class="import-fill" :style="{ width: library.importProgress + '%' }"></div></div>
  </div>
  <div v-if="library.importPhase === 'error' && library.importError" class="notice-bar" data-testid="import-error">
    <i class="ph ph-warning-circle"></i>
    <span>{{ library.importError }}</span>
    <i class="ph ph-x close" title="关闭" @click="dismissError"></i>
  </div>

  <!-- 空态 -->
  <div v-if="library.loaded && !library.papers.length" class="lib-empty" data-anim="lib-empty">
    <i class="ph ph-books"></i>
    <div class="t">书架尚空</div>
    <div class="s">拖入或上传 PDF 文献<br />题录将自动预填、可修改</div>
    <button class="btn btn-primary" style="margin-top: 12px" data-testid="btn-upload-empty" @click="pickFiles">
      <i class="ph ph-upload-simple"></i> 上传文献
    </button>
  </div>

  <!-- 列表 -->
  <div
    v-for="p in library.papers"
    :key="p.id"
    class="lib-item"
    :class="{ active: p.id === library.currentId }"
    :data-testid="`paper-${p.id}`"
    @click="openPaper(p)"
  >
    <div class="lib-title-line">{{ p.title }}</div>
    <div class="lib-meta">
      <span v-if="p.venue || p.year">{{ [p.venue, p.year].filter(Boolean).join(' ') }}</span>
      <button
        class="status-chip"
        :class="STATUS_CLASS[p.status]"
        :data-testid="`status-${p.id}`"
        :title="'点击切换状态（当前：' + STATUS_LABEL[p.status] + '）'"
        @click.stop="cycleStatus(p)"
      >
        {{ STATUS_LABEL[p.status] }}
      </button>
      <span class="progress-num">{{ p.lastPage }}/{{ p.totalPages }}</span>
      <span v-if="p.textEmpty" :data-testid="`scanwarn-${p.id}`" title="疑似扫描版，无文本层">
        <i class="ph ph-warning-diamond" style="font-size: 12px"></i>
      </span>
    </div>
    <div v-if="p.tags.length" class="lib-tags">
      <span v-for="t in p.tags" :key="t" class="tag">
        {{ t }}
        <i class="ph ph-x tag-x" @click.stop="library.removeTag(p.id, t)"></i>
      </span>
    </div>
    <div class="tag-edit">
      <button class="tag-add" @click.stop="startTagAdd(p)"><i class="ph ph-plus" style="font-size: 9px"></i> 标签</button>
      <button class="tag-add" :data-testid="`edit-${p.id}`" title="编辑题录" @click.stop="editMeta(p)">
        <i class="ph ph-pencil-simple" style="font-size: 9px"></i> 题录
      </button>
      <button class="tag-add" :data-testid="`del-${p.id}`" title="移除文献" style="color: var(--accent-deep)" @click.stop="confirmDeleteFor = p.id">
        <i class="ph ph-trash" style="font-size: 9px"></i> 移除
      </button>
      <input
        v-if="tagInputFor === p.id"
        v-model="tagDraft"
        class="tag-input"
        placeholder="回车添加"
        data-testid="tag-input"
        @keyup.enter="commitTag(p)"
        @keyup.esc="tagInputFor = null"
        @blur="commitTag(p)"
        @click.stop
      />
    </div>
  </div>

  <!-- 列表底部上传按钮 -->
  <div v-if="library.papers.length" style="margin-top: 10px; padding: 0 4px">
    <button class="btn" style="width: 100%" data-testid="btn-upload" @click="pickFiles">
      <i class="ph ph-plus"></i> 上传 PDF
    </button>
  </div>

  <input
    ref="fileInput"
    type="file"
    accept="application/pdf,.pdf"
    multiple
    hidden
    data-testid="file-input"
    @change="onFileChange"
  />

  <!-- 拖拽遮罩 -->
  <teleport to="body">
    <div v-if="dragging" class="dialog-mask" data-testid="drop-overlay" style="background: rgba(178, 58, 36, 0.12)">
      <div class="dialog" style="width: auto; padding: 34px 56px; text-align: center">
        <i class="ph ph-file-pdf" style="font-size: 34px; color: var(--accent)"></i>
        <div style="font-family: var(--font-serif); font-size: 17px; margin-top: 10px">松手即入库</div>
        <div style="font-size: 12px; color: var(--ink-3); margin-top: 4px">仅支持 .pdf，可多选</div>
      </div>
    </div>
  </teleport>

  <!-- 题录编辑 -->
  <MetaDialog
    v-if="metaPaper"
    :paper="metaPaper"
    :subtitle="metaPaper.fileName"
    @close="showMetaFor = null"
    @save="saveMeta"
  />

  <!-- 删除确认 -->
  <teleport to="body">
    <div v-if="confirmDeleteFor" class="dialog-mask" @click.self="confirmDeleteFor = null">
      <div class="dialog" style="width: min(420px, calc(100vw - 48px))">
        <div class="dialog-title">移除文献</div>
        <div class="dialog-sub">将从本机移除该文献及其全部笔记、问答与提取结果，不可恢复。</div>
        <div class="dialog-actions">
          <button class="btn" @click="confirmDeleteFor = null">取消</button>
          <button class="btn btn-danger" data-testid="confirm-delete" @click="doDelete">移除</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
