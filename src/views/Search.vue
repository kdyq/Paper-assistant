<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { dbGetAll } from '../services/db'
import { useLibraryStore } from '../stores/library'
import { useReaderStore } from '../stores/reader'
import { safeFrom } from '../utils/anim'

interface Hit {
  paperId: string
  paperTitle: string
  page: number
  snippet: string // 已 HTML 转义 + <mark>
  quote: string // 供跳转高亮的原文片段
}

const router = useRouter()
const library = useLibraryStore()
const reader = useReaderStore()

const query = ref('')
const searched = ref('')
const searching = ref(false)
const hits = ref<Hit[]>([])
const searchedPapers = ref(0)

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 在规范化文本中做大小写不敏感检索，生成片段与高亮引文 */
function searchAll() {
  const q = query.value.trim()
  if (!q || searching.value) return
  searching.value = true
  searched.value = q
  hits.value = []
  searchedPapers.value = 0
  requestAnimationFrame(async () => {
    try {
      const rows = await dbGetAll<{ paperId: string; page: number; text: string }>('pageTexts')
      const byPaper = new Map<string, { page: number; text: string }[]>()
      for (const r of rows) {
        const list = byPaper.get(r.paperId) ?? []
        list.push({ page: r.page, text: r.text })
        byPaper.set(r.paperId, list)
      }
      const lower = q.toLowerCase()
      const out: Hit[] = []
      for (const [paperId, pages] of byPaper) {
        searchedPapers.value++
        const paper = library.papers.find((p) => p.id === paperId)
        let paperHits = 0
        for (const p of pages.sort((a, b) => a.page - b.page)) {
          if (paperHits >= 5) break
          const text = p.text
          const idx = text.toLowerCase().indexOf(lower)
          if (idx < 0) continue
          const start = Math.max(0, idx - 50)
          const end = Math.min(text.length, idx + q.length + 70)
          const raw = text.slice(start, end).replace(/\s+/g, ' ')
          const marked = escapeHtml(raw).replace(
            new RegExp(escapeRegExp(q), 'i'),
            (m) => `<mark>${m}</mark>`,
          )
          out.push({
            paperId,
            paperTitle: paper?.title ?? paperId,
            page: p.page,
            snippet: marked,
            quote: text.slice(idx, Math.min(text.length, idx + Math.max(q.length, 24))).replace(/\s+/g, ' '),
          })
          paperHits++
          if (out.length >= 50) break
        }
        if (out.length >= 50) break
      }
      hits.value = out
    } finally {
      searching.value = false
    }
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 命中项 → 打开文献 + 跳页 + 高亮（匹配失败降级仅跳页） */
async function goHit(h: Hit) {
  await library.openPaper(h.paperId)
  void reader.jumpWithHighlight(h.page, h.quote)
  router.push('/')
  requestAnimationFrame(() => {
    const sheet = document.querySelector('[data-anim="sheet"]')
    if (sheet) safeFrom(sheet, { y: 10, autoAlpha: 0, duration: 0.3 })
  })
}

function groupKey(i: number): string {
  const h = hits.value[i]
  return `${h.paperId}-${h.page}`
}
</script>

<script lang="ts">
export default { name: 'SearchView' }
</script>

<template>
  <article class="sheet" data-anim="sheet" style="width: min(720px, 100%)">
    <div class="venue">书斋 · 检索</div>
    <h1 class="paper-title">全文检索</h1>
    <div class="paper-title-zh">跨文献检索已入库的每一页原文，命中即可跳转定位</div>

    <div class="search-form">
      <input
        v-model="query"
        class="field"
        data-testid="search-input"
        placeholder="输入关键词，如：diffusion / 修复"
        autofocus
        @keyup.enter="searchAll"
      />
      <button class="btn btn-primary" data-testid="search-run" :disabled="searching" @click="searchAll">
        {{ searching ? '检索中…' : '检索' }}
      </button>
    </div>

    <!-- 空态 -->
    <div v-if="!searched && !searching" class="empty-hint">
      <i class="ph ph-magnifying-glass"></i>
      <p>输入关键词开始检索。<br />索引为各文献的逐页文本（含中文篇）。</p>
    </div>

    <!-- 无结果 -->
    <div v-else-if="!searching && !hits.length" class="empty-hint" data-testid="search-empty">
      <i class="ph ph-file-magnifying-glass"></i>
      <p>在 {{ searchedPapers }} 篇文献中未找到「{{ searched }}」。</p>
    </div>

    <!-- 结果 -->
    <div v-else-if="hits.length" class="search-results" data-testid="search-results">
      <div class="search-meta">命中 {{ hits.length }} 处 · 覆盖 {{ searchedPapers }} 篇文献</div>
      <div
        v-for="(h, i) in hits"
        :key="groupKey(i) + '-' + i"
        class="search-hit"
        :data-testid="`hit-${i}`"
        @click="goHit(h)"
      >
        <div class="hit-head">
          <span class="hit-title">{{ h.paperTitle }}</span>
          <span class="hit-page">P.{{ h.page }}</span>
        </div>
        <div class="hit-snippet" v-html="h.snippet"></div>
      </div>
    </div>

    <div class="page-foot"><span>书斋 · 检索</span><span>SEARCH</span></div>
  </article>
</template>

<style scoped>
.search-form {
  display: flex;
  gap: 8px;
  margin: 20px 0 8px;
}
.search-meta {
  font-size: 11px;
  color: var(--ink-3);
  margin: 10px 2px;
}
.search-hit {
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--sheet);
  padding: 11px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.search-hit:hover {
  border-color: var(--accent);
}
.hit-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 5px;
}
.hit-title {
  font-size: 12.5px;
  color: var(--ink);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hit-page {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--accent-deep);
  white-space: nowrap;
}
.hit-snippet {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
}
.hit-snippet :deep(mark) {
  background: var(--hl);
  color: var(--ink);
  padding: 0 1px;
  border-radius: 2px;
}
</style>
