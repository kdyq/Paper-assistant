<script setup lang="ts">
import { watch } from 'vue'
import PageHud from '../components/reader/PageHud.vue'
import PdfSheet from '../components/reader/PdfSheet.vue'
import { useLibraryStore } from '../stores/library'
import { useReaderStore } from '../stores/reader'

const library = useLibraryStore()
const reader = useReaderStore()

// 书架选中变化 → 打开阅读器（从上次页码续读）
watch(
  () => library.currentId,
  (id) => {
    if (id) void reader.open(id)
  },
  { immediate: true },
)
</script>

<template>
  <!-- 无选中：空态 -->
  <article v-if="!library.current" class="sheet" data-anim="sheet">
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

  <!-- 打开失败 -->
  <article v-else-if="reader.error" class="sheet" data-anim="sheet">
    <div class="empty-hint">
      <i class="ph ph-file-x"></i>
      <p>文献打开失败：{{ reader.error }}</p>
    </div>
  </article>

  <!-- 阅读中 -->
  <template v-else>
    <PdfSheet />
    <PageHud />
  </template>
</template>
