<script setup lang="ts">
/** 文本选择菜单：解释/翻译 → 伴读问答（Step 6）；记笔记 → Step 7 */
const emit = defineEmits<{ action: [kind: 'explain' | 'translate' | 'note'] }>()

const ACTIONS = [
  { key: 'explain', label: '解释这段', icon: 'ph ph-chat-circle-text' },
  { key: 'translate', label: '翻译这段', icon: 'ph ph-translate' },
  { key: 'note', label: '记笔记', icon: 'ph ph-notebook-pen' },
] as const
</script>

<template>
  <div class="sel-menu" data-testid="sel-menu">
    <button
      v-for="a in ACTIONS"
      :key="a.key"
      class="sel-btn"
      :data-testid="`sel-${a.key}`"
      @click="emit('action', a.key)"
    >
      <i :class="a.icon"></i>{{ a.label }}
    </button>
  </div>
</template>
