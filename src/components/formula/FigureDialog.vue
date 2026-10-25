<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AiError, chat } from '../../services/ai'
import { useNotesStore } from '../../stores/notes'

/** 图表解读弹层（Step 11）：框选区域截图 → 视觉模型流式解读 → 可存为笔记 */
const props = defineProps<{ image: string; page: number }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const notes = useNotesStore()
const status = ref<'running' | 'done' | 'error'>('running')
const interpretation = ref('')
const reasoningLen = ref(0)
let controller: AbortController | null = null

async function run() {
  if (controller) controller.abort()
  controller = new AbortController()
  status.value = 'running'
  interpretation.value = ''
  reasoningLen.value = 0
  try {
    const full = await chat(
      [
        {
          role: 'system',
          content:
            '你是论文图表解读助手。用户给出论文某页框选区域的截图。请用中文回答，结构固定为：\n【图注】一句话说明这是什么图（柱状/曲线/流程/示意等）与主题。\n【要点】3-6 条，每条一行「- 」，给出可读出的数据、对比与趋势（数值尽量照抄图中）。\n【作用】一句话说明该图在论文论证中的作用。\n看不清或截图中无图表时如实说明。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `论文第 ${props.page} 页，框选区域如下：` },
            { type: 'image_url', image_url: { url: props.image } },
          ],
        },
      ],
      {
        temperature: 0.2,
        signal: controller.signal,
        onDelta: (d) => {
          interpretation.value += d
        },
        onReasoning: (d) => {
          reasoningLen.value += d.length
        },
      },
    )
    interpretation.value = full
    status.value = 'done'
  } catch (e) {
    if (controller.signal.aborted) return
    status.value = 'error'
    interpretation.value = e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e)
  }
}

async function saveAsNote() {
  if (status.value !== 'done') return
  const paperId = notes.loadedFor
  if (!paperId) return
  await notes.create(paperId, { page: props.page, quote: '[图表截图]', content: interpretation.value })
  emit('saved')
  emit('close')
}

onMounted(() => {
  void run()
})
onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<template>
  <teleport to="body">
    <div class="dialog-mask" data-testid="figure-dialog" @click.self="emit('close')">
      <div class="dialog" style="width: min(640px, calc(100vw - 48px))">
        <div class="dialog-title">图表解读</div>
        <div class="dialog-sub">论文第 {{ page }} 页 · 框选区域</div>

        <img :src="image" class="figure-shot" data-testid="figure-shot" alt="框选的图表区域" />

        <div class="sec-label" style="margin: 16px 0 10px"><span class="sec-num">释</span>AI 解读</div>
        <div v-if="status === 'running'" class="fig-status" data-testid="figure-status">
          <i class="ph ph-circle-notch spin"></i>
          <template v-if="interpretation">批注中 {{ interpretation.length }} 字</template>
          <template v-else-if="reasoningLen">看图中 · {{ reasoningLen }} 字</template>
          <template v-else>看图中…</template>
        </div>
        <div v-else-if="status === 'error'" class="notice-bar" data-testid="figure-error">
          <i class="ph ph-warning-circle"></i><span>{{ interpretation }}</span>
        </div>
        <div v-else class="fig-text" data-testid="figure-interpret">{{ interpretation }}</div>

        <div class="dialog-actions">
          <button v-if="status === 'done'" class="btn" data-testid="figure-save-note" @click="saveAsNote">
            <i class="ph ph-notebook"></i> 存为笔记
          </button>
          <button class="btn" :disabled="status === 'running'" data-testid="figure-regen" @click="run">
            <i class="ph ph-arrow-counter-clockwise"></i> 重新解读
          </button>
          <button class="btn btn-primary" data-testid="figure-close" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.figure-shot {
  display: block;
  max-width: 100%;
  max-height: 280px;
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
}
.fig-status {
  font-size: 12px;
  color: var(--accent-deep);
  background: var(--accent-wash);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 6px 12px;
}
.fig-text {
  font-size: 12.5px;
  line-height: 1.9;
  color: var(--ink-2);
  white-space: pre-wrap;
  max-height: 260px;
  overflow-y: auto;
}
.spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
