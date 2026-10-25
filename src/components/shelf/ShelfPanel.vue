<script setup lang="ts">
// 左栏书架。Step 1 为空态；Step 2 接入真实文献列表（上传/题录/状态chip/标签）。
</script>

<template>
  <div class="lib-head">
    <span class="lib-title">书架</span><span class="lib-count">0 篇</span>
  </div>
  <div class="lib-empty" data-anim="lib-empty">
    <i class="ph ph-books"></i>
    <div class="t">书架尚空</div>
    <div class="s">上传 PDF 文献后<br />将在此按阅读状态陈列</div>
  </div>
</template>
