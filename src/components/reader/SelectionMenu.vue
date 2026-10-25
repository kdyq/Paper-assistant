<script setup lang="ts">
import { computed } from 'vue'
import { looksMathy } from '../../utils/math'

/** 文本选择菜单：解释/翻译 → 伴读问答（Step 6）；公式 → Step 10；记笔记 → Step 7 */
const props = defineProps<{ text: string }>()
const emit = defineEmits<{ action: [kind: 'explain' | 'translate' | 'note' | 'formula'] }>()

const mathy = computed(() => looksMathy(props.text))

const ACTIONS = [
  { key: 'explain', label: '解释这段', icon: 'ph ph-chat-circle-text' },
  { key: 'translate', label: '翻译这段', icon: 'ph ph-translate' },
  { key: 'note', label: '记笔记', icon: 'ph ph-notebook-pen' },
] as const
</script>

<template>
  <div class="sel-menu" data-testid="sel-menu">
    <template v-for="a in ACTIONS" :key="a.key">
      <button class="sel-btn" :data-testid="`sel-${a.key}`" @click="emit('action', a.key)">
        <i :class="a.icon"></i>{{ a.label }}
      </button>
    </template>
    <button v-if="mathy" class="sel-btn sel-formula" data-testid="sel-formula" @click="emit('action', 'formula')">
      <i class="ph ph-square-root-of-x"></i>解释公式
    </button>
  </div>
</template>

<style scoped>
.sel-formula {
  color: var(--accent-deep);
}
</style>

