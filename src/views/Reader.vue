<script setup lang="ts">
// 中央读纸区。Step 1 空态；Step 3 接入 pdfjs 渲染与翻页 HUD。
</script>

<template>
  <article class="sheet" data-anim="sheet">
    <div class="venue">书斋 · 精读模式</div>
    <h1 class="paper-title">从左侧书架选择文献</h1>
    <div class="paper-title-zh">上传 PDF 后逐页精读，右侧伴读随时批注</div>
    <div class="empty-hint">
      <i class="ph ph-book-open-text"></i>
      <p>书架还没有文献。<br />Step 2 起支持上传 PDF，自动提取题录并开始精读。</p>
    </div>
    <div class="page-foot">
      <span>书斋 · 精读模式</span><span>第 — 页</span>
    </div>
  </article>
  <div class="hud" data-anim="hud">
    <button class="icon-btn" title="上一页" disabled><i class="ph ph-arrow-left"></i></button>
    <span>— / —</span>
    <button class="icon-btn" title="下一页" disabled><i class="ph ph-arrow-right"></i></button>
  </div>
</template>
