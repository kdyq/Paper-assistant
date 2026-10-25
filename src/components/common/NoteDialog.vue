<script setup lang="ts">
import { reactive, watch } from 'vue'

/** 笔记编辑弹层：新建（可预填引文与页码）/ 编辑 */
const props = defineProps<{
  page?: number // 0/undefined = 全局
  quote?: string
  content?: string
  editingId?: string
}>()

const emit = defineEmits<{
  close: []
  save: [data: { content: string; quote: string }]
}>()

const form = reactive({ content: '', quote: '' })

watch(
  () => props.editingId,
  () => {
    form.content = props.content ?? ''
    form.quote = props.quote ?? ''
  },
  { immediate: true },
)

function save() {
  if (!form.content.trim()) return
  emit('save', { content: form.content.trim(), quote: form.quote.trim() })
}
</script>

<template>
  <teleport to="body">
    <div class="dialog-mask" data-testid="note-dialog" @click.self="emit('close')">
      <div class="dialog">
        <div class="dialog-title">{{ editingId ? '编辑笔记' : '新建笔记' }}</div>
        <div class="dialog-sub">
          <template v-if="page && page > 0">锚定 P.{{ page }}</template>
          <template v-else>全局笔记（不锚定页码）</template>
        </div>

        <div v-if="quote" class="note-quote-box" data-testid="note-quote">
          <i class="ph ph-quotes"></i>
          <span>{{ quote }}</span>
        </div>

        <div class="form-row">
          <label>内容</label>
          <textarea
            v-model="form.content"
            class="field"
            rows="5"
            placeholder="记下你的理解、疑问或延伸想法…"
            data-testid="note-content"
            autofocus
          ></textarea>
        </div>

        <div class="form-row">
          <label>引文</label>
          <input v-model="form.quote" class="field" placeholder="可留空；填写后可从笔记跳回原文" />
        </div>

        <div class="dialog-actions">
          <button class="btn" data-testid="note-cancel" @click="emit('close')">取消</button>
          <button class="btn btn-primary" data-testid="note-save" :disabled="!form.content.trim()" @click="save">
            保存
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.note-quote-box {
  display: flex;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 2px solid var(--accent);
  border-radius: 3px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
  margin-bottom: 12px;
  max-height: 110px;
  overflow-y: auto;
}
.note-quote-box i {
  color: var(--accent);
  margin-top: 2px;
  flex-shrink: 0;
}
</style>
