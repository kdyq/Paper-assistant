<script setup lang="ts">
/** 文本选择轻量菜单（Step 3 占位；解释/翻译接 Step 5 AI，记笔记接 Step 7） */
import { computed, ref } from 'vue'

const props = defineProps<{ x: number; y: number; text: string }>()
const emit = defineEmits<{ close: [] }>()

const styleLeft = computed(() => `${Math.min(Math.max(props.x, 110), window.innerWidth - 110)}px`)
const styleTop = computed(() => `${Math.max(props.y - 44, 8)}px`)

const note = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

const ACTIONS = [
  { key: 'explain', label: '解释这段', icon: 'ph ph-chat-circle-text', step: 'AI 提取与解释（Step 5）' },
  { key: 'translate', label: '翻译这段', icon: 'ph ph-translate', step: 'AI 接入（Step 5）' },
  { key: 'note', label: '记笔记', icon: 'ph ph-notebook-pen', step: '笔记（Step 7）' },
] as const

function act(label: string, step: string) {
  note.value = `「${label}」将在${step}接入后开放`
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    note.value = ''
  }, 1600)
}
</script>

<template>
  <div class="sel-menu" data-testid="sel-menu" :style="{ left: styleLeft, top: styleTop }">
    <button v-for="a in ACTIONS" :key="a.key" class="sel-btn" :data-testid="`sel-${a.key}`" @click="act(a.label, a.step)">
      <i :class="a.icon"></i>{{ a.label }}
    </button>
    <div v-if="note" class="sel-note">{{ note }}</div>
  </div>
</template>
