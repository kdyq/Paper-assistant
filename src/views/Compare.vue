<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { AiError, chat } from '../services/ai'
import {
  COMPARE_DIMS,
  buildCompareMarkdown,
  buildCompareMessages,
  parseCompareJson,
  type CompareRow,
} from '../services/compare'
import { downloadText, safeFileName } from '../services/export'
import { loadPageTexts, useLibraryStore } from '../stores/library'

/** 文献对比矩阵（Step 13）：选 2~4 篇 → AI 填五维度 → 手改 → 导出 Markdown 表格 */
const library = useLibraryStore()

const MAX_PAPERS = 4
const selected = ref<string[]>([])
const rows = reactive<Record<string, CompareRow>>({})
const rowStatus = reactive<Record<string, 'idle' | 'running' | 'done' | 'error'>>({})
const rowError = reactive<Record<string, string>>({})

const canRun = computed(() => selected.value.length >= 2)
const allDone = computed(
  () => selected.value.length >= 2 && selected.value.every((id) => rowStatus[id] === 'done'),
)

function toggle(id: string) {
  if (selected.value.includes(id)) {
    selected.value = selected.value.filter((x) => x !== id)
    return
  }
  if (selected.value.length >= MAX_PAPERS) return
  selected.value = [...selected.value, id]
}

function paperTitle(id: string): string {
  return library.papers.find((p) => p.id === id)?.title ?? id
}

async function runCompare() {
  for (const id of selected.value) {
    if (rowStatus[id] === 'running') continue
    rowStatus[id] = 'running'
    rowError[id] = ''
    try {
      const paper = library.papers.find((p) => p.id === id)
      if (!paper) throw new Error('文献不存在')
      if (paper.textEmpty) throw new Error('该文献为扫描版（无文本层），无法参与对比。')
      const pages = await loadPageTexts(id)
      if (!pages.length) throw new Error('未找到页面文本，请重新上传。')
      const msgs = buildCompareMessages({ title: paper.title }, pages.map((p) => ({ page: p.page, text: p.text })))
      const raw = await chat(msgs, { temperature: 0.2 })
      const row = parseCompareJson(raw)
      if (!row) throw new Error('AI 输出无法解析为对比 JSON，请重试。')
      rows[id] = row
      rowStatus[id] = 'done'
    } catch (e) {
      rowStatus[id] = 'error'
      rowError[id] = e instanceof AiError || e instanceof Error ? e.message : String(e)
    }
  }
}

function cellText(id: string, dim: string): string {
  const row = rows[id]
  if (!row) return ''
  return (row as unknown as Record<string, string>)[dim] ?? ''
}

function commitCell(id: string, dim: string, e: Event) {
  const el = e.target as HTMLElement
  const row = rows[id]
  if (!row) return
  row[dim as keyof CompareRow] = el.textContent?.trim() ?? ''
}

function exportMd() {
  if (!allDone.value) return
  const titles = selected.value.map(paperTitle)
  const data = selected.value.map((id) => rows[id])
  downloadText(`文献对比_${safeFileName(titles.join('_vs_'))}.md`, buildCompareMarkdown(titles, data))
}
</script>

<template>
  <article class="sheet" data-anim="sheet" style="width: min(880px, 100%)">
    <div class="venue">书斋 · 对比</div>
    <h1 class="paper-title">文献对比矩阵</h1>
    <div class="paper-title-zh">选 2~4 篇，AI 按五维度填表，格子可手改，可导出 Markdown</div>

    <!-- 选文献 -->
    <div class="sec-label"><span class="sec-num">一</span>选择文献（{{ selected.length }}/{{ MAX_PAPERS }}）</div>
    <div v-if="!library.papers.length" class="empty-hint">
      <i class="ph ph-books"></i>
      <p>书架还没有文献，先回阅读页上传 PDF。</p>
    </div>
    <div v-else class="cmp-pick">
      <button
        v-for="p in library.papers"
        :key="p.id"
        class="cmp-pick-item"
        :class="{ active: selected.includes(p.id), disabled: !selected.includes(p.id) && selected.length >= MAX_PAPERS }"
        :data-testid="`cmp-pick-${p.id}`"
        @click="toggle(p.id)"
      >
        <i :class="selected.includes(p.id) ? 'ph-fill ph-check-square' : 'ph ph-square'"></i>
        <span>{{ p.title }}</span>
      </button>
    </div>

    <div class="dialog-actions" style="justify-content: flex-start">
      <button class="btn btn-primary" :disabled="!canRun || selected.some((id) => rowStatus[id] === 'running')" data-testid="cmp-run" @click="runCompare">
        <i class="ph ph-magic-wand"></i> AI 填表对比
      </button>
      <button class="btn" :disabled="!allDone" data-testid="cmp-export" @click="exportMd">
        <i class="ph ph-download-simple"></i> 导出 Markdown 表格
      </button>
    </div>

    <!-- 矩阵 -->
    <div v-if="selected.length" class="cmp-table-wrap" data-testid="cmp-table">
      <table class="cmp-table">
        <thead>
          <tr>
            <th class="dim-col">维度</th>
            <th v-for="id in selected" :key="id" class="paper-col">
              <div class="cmp-col-head">
                <span class="cmp-col-title">{{ paperTitle(id) }}</span>
                <span v-if="rowStatus[id] === 'running'" class="cmp-col-status"><i class="ph ph-circle-notch spin"></i> 生成中</span>
                <span v-else-if="rowStatus[id] === 'error'" class="cmp-col-status err">{{ rowError[id] }}</span>
                <span v-else-if="rowStatus[id] === 'done'" class="cmp-col-status ok">可手改</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="dim in COMPARE_DIMS" :key="dim.key">
            <td class="dim-col">{{ dim.label }}</td>
            <td v-for="id in selected" :key="id + dim.key">
              <div
                v-if="rowStatus[id] === 'done'"
                class="cmp-cell"
                contenteditable="true"
                :data-testid="`cmp-cell-${id}-${dim.key}`"
                @blur="commitCell(id, dim.key, $event)"
              >{{ cellText(id, dim.key) }}</div>
              <div v-else-if="rowStatus[id] === 'running'" class="cmp-cell muted">…</div>
              <div v-else-if="rowStatus[id] === 'error'" class="cmp-cell muted">—</div>
              <div v-else class="cmp-cell muted">待生成</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="page-foot"><span>书斋 · 对比</span><span>COMPARE</span></div>
  </article>
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
.cmp-pick {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.cmp-pick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  font-size: 12.5px;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  padding: 9px 12px;
}
.cmp-pick-item:hover {
  border-color: var(--accent);
}
.cmp-pick-item.active {
  color: var(--accent-deep);
  border-color: var(--accent);
  background: var(--accent-wash);
}
.cmp-pick-item.disabled {
  opacity: 0.45;
}
.cmp-pick-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmp-table-wrap {
  margin-top: 14px;
  overflow-x: auto;
}
.cmp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.cmp-table th,
.cmp-table td {
  border: 1px solid var(--line);
  padding: 9px 11px;
  vertical-align: top;
  text-align: left;
}
.cmp-table th {
  background: var(--surface);
  font-family: var(--font-serif);
  letter-spacing: 0.04em;
}
.dim-col {
  width: 84px;
  color: var(--accent-deep);
  font-weight: 600;
  white-space: nowrap;
}
.paper-col {
  min-width: 200px;
}
.cmp-col-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cmp-col-title {
  font-size: 12px;
  color: var(--ink);
  line-height: 1.4;
}
.cmp-col-status {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-sans);
  font-weight: 400;
}
.cmp-col-status.err {
  color: var(--accent-deep);
}
.cmp-cell {
  min-height: 20px;
  line-height: 1.7;
  color: var(--ink-2);
  outline: none;
}
.cmp-cell:focus {
  background: var(--accent-wash);
  box-shadow: 0 0 0 1px var(--accent);
}
.cmp-cell.muted {
  color: var(--ink-3);
}
</style>
