<script setup lang="ts">
import { useReaderStore } from '../../stores/reader'

const reader = useReaderStore()
</script>

<template>
  <div class="hud" data-anim="hud" data-testid="page-hud">
    <button class="icon-btn" title="上一页（Step 8 快捷键 ←）" :disabled="reader.pageNo <= 1" data-testid="hud-prev" @click="reader.prevPage()">
      <i class="ph ph-arrow-left"></i>
    </button>
    <span data-testid="hud-page">{{ reader.pageNo }} / {{ reader.totalPages }}</span>
    <button class="icon-btn" title="下一页" :disabled="reader.pageNo >= reader.totalPages" data-testid="hud-next" @click="reader.nextPage()">
      <i class="ph ph-arrow-right"></i>
    </button>

    <span class="hud-sep"></span>

    <button class="icon-btn" title="缩小" :disabled="reader.zoom <= 0.5" data-testid="hud-zoom-out" @click="reader.zoomOut()">
      <i class="ph ph-minus"></i>
    </button>
    <button class="hud-zoom" title="恢复 100%（适应宽度）" data-testid="hud-zoom-val" @click="reader.resetZoom()">
      {{ Math.round(reader.zoom * 100) }}%
    </button>
    <button class="icon-btn" title="放大" :disabled="reader.zoom >= 2" data-testid="hud-zoom-in" @click="reader.zoomIn()">
      <i class="ph ph-plus"></i>
    </button>
  </div>
</template>
