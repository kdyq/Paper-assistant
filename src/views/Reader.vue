<script setup lang="ts">
import { computed } from 'vue'
import { useLibraryStore } from '../stores/library'

const library = useLibraryStore()
const paper = computed(() => library.current)

function fmtSize(n: number): string {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'
}
</script>

<template>
  <!-- 无选中：空态 -->
  <article v-if="!paper" class="sheet" data-anim="sheet">
    <div class="venue">书斋 · 精读模式</div>
    <h1 class="paper-title">从左侧书架选择文献</h1>
    <div class="paper-title-zh">上传 PDF 后逐页精读，右侧伴读随时批注</div>
    <div class="empty-hint">
      <i class="ph ph-book-open-text"></i>
      <p>书架还没有文献。<br />拖入 PDF 即可入库，题录自动预填。</p>
    </div>
    <div class="page-foot">
      <span>书斋 · 精读模式</span><span>第 — 页</span>
    </div>
  </article>

  <!-- 已选中：题录封面（Step 3 替换为 pdfjs 逐页渲染） -->
  <article v-else class="sheet" data-anim="sheet" :data-testid="`cover-${paper.id}`">
    <div class="venue">
      {{ [paper.venue, paper.year].filter(Boolean).join(' · ') || '题录未标注出处' }}
      · 论文页 {{ paper.lastPage }} / {{ paper.totalPages }}
    </div>
    <h1 class="paper-title">{{ paper.title }}</h1>
    <div v-if="paper.titleZh" class="paper-title-zh">{{ paper.titleZh }}</div>
    <div class="authors">{{ paper.authors.length ? paper.authors.join(', ') : '作者未识别（可在左侧题录中补全）' }}</div>
    <div class="authors-org">
      {{ paper.fileName }} · {{ fmtSize(paper.size) }} · 入库于 {{ new Date(paper.addedAt).toLocaleDateString() }}
    </div>
    <div v-if="paper.doi" class="authors-org">DOI：{{ paper.doi }}</div>

    <div v-if="paper.tags.length" class="lib-tags" style="justify-content: center; margin-top: 4px">
      <span v-for="t in paper.tags" :key="t" class="tag">{{ t }}</span>
    </div>

    <div class="sec-label"><span class="sec-num">一</span>阅读</div>
    <div v-if="paper.textEmpty" class="notice-bar" data-testid="cover-scanwarn">
      <i class="ph ph-warning-diamond"></i>
      <span>该文献疑似扫描版（无文本层）：不支持 OCR。阅读不受影响，但 AI 提取、问答与检索将受限。</span>
    </div>
    <div class="empty-hint" style="margin-top: 18px">
      <i class="ph ph-file-text"></i>
      <p style="font-size: 12.5px; line-height: 2; color: var(--ink-3)">
        逐页阅读将于下一步开放（正在渲染 PDF 画布、翻页与缩放）。<br />
        当前页码进度（{{ paper.lastPage }}/{{ paper.totalPages }}）已随文献入库记忆。
      </p>
    </div>

    <div class="page-foot">
      <span>书斋 · 精读模式</span><span>第 {{ paper.lastPage }} 页，共 {{ paper.totalPages }} 页</span>
    </div>
  </article>

  <div class="hud" data-anim="hud">
    <button class="icon-btn" title="上一页" disabled><i class="ph ph-arrow-left"></i></button>
    <span v-if="paper">{{ paper.lastPage }} / {{ paper.totalPages }}</span>
    <span v-else>— / —</span>
    <button class="icon-btn" title="下一页" disabled><i class="ph ph-arrow-right"></i></button>
  </div>
</template>
