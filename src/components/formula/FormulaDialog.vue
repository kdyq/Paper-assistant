<script setup lang="ts">
import katex from 'katex'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AiError, chat } from '../../services/ai'
import { looksMathy, toLatex } from '../../utils/math'

/** 公式解释弹层（Step 10）：KaTeX 渲染 + AI 逐符号流式解释 */
const props = defineProps<{ text: string; page: number }>()
const emit = defineEmits<{ close: [] }>()

const latex = computed(() => (looksMathy(props.text) ? toLatex(props.text) : props.text))
const renderState = ref<'ok' | 'partial' | 'raw'>('ok')
const katexHtml = ref('')

const status = ref<'running' | 'done' | 'error'>('running')
const explanation = ref('')
const reasoningLen = ref(0)
let controller: AbortController | null = null

function render() {
  try {
    katexHtml.value = katex.renderToString(latex.value, { throwOnError: true, displayMode: true })
    renderState.value = 'ok'
  } catch {
    // 容错渲染：非法部分标红，仍可读
    try {
      katexHtml.value = katex.renderToString(latex.value, { throwOnError: false, displayMode: true })
      renderState.value = 'partial'
    } catch {
      renderState.value = 'raw'
    }
  }
}

async function runExplain() {
  if (controller) controller.abort()
  controller = new AbortController()
  status.value = 'running'
  explanation.value = ''
  reasoningLen.value = 0
  try {
    const full = await chat(
      [
        {
          role: 'system',
          content:
            '你是数学/机器学习公式讲解助手。用户给出从 PDF 文本层提取的公式线性文本（可能残缺、上标丢失）。请用中文回答：1) 先逐符号解释（一行一个记号，用「符号 — 含义」格式）；2) 再用两三句解释公式的整体含义。若文本明显残缺，按该领域最常见的公式形式合理推断，并注明「依据常见形式推断」。总长不超过 300 字。',
        },
        { role: 'user', content: `论文第 ${props.page} 页的公式文本：\n${props.text}` },
      ],
      {
        temperature: 0.2,
        signal: controller.signal,
        onDelta: (d) => {
          explanation.value += d
        },
        onReasoning: (d) => {
          reasoningLen.value += d.length
        },
      },
    )
    explanation.value = full
    status.value = 'done'
  } catch (e) {
    if (controller.signal.aborted) return
    status.value = 'error'
    explanation.value = e instanceof AiError ? e.message : e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => {
  render()
  void runExplain()
})
onBeforeUnmount(() => {
  controller?.abort()
})
</script>

<template>
  <teleport to="body">
    <div class="dialog-mask" data-testid="formula-dialog" @click.self="emit('close')">
      <div class="dialog">
        <div class="dialog-title">公式解释</div>
        <div class="dialog-sub">论文第 {{ page }} 页 · 选中文本</div>

        <!-- KaTeX 渲染 -->
        <div class="formula-render" data-testid="formula-render">
          <div v-if="renderState !== 'raw'" class="katex-box" data-testid="katex-box" v-html="katexHtml"></div>
          <div v-else class="raw-box">{{ text }}</div>
          <div v-if="renderState === 'partial'" class="render-hint">
            <i class="ph ph-info"></i> 原文提取有残缺，公式按容错模式渲染
          </div>
        </div>

        <!-- 原文 -->
        <div class="formula-src">"{{ text }}"</div>

        <!-- AI 解释 -->
        <div class="sec-label" style="margin: 18px 0 10px"><span class="sec-num">释</span>逐符号解释</div>
        <div v-if="status === 'running'" class="explain-status" data-testid="formula-status">
          <i class="ph ph-circle-notch spin"></i>
          <template v-if="explanation">批注中 {{ explanation.length }} 字</template>
          <template v-else-if="reasoningLen">研读中 · {{ reasoningLen }} 字</template>
          <template v-else>研读中…</template>
        </div>
        <div v-else-if="status === 'error'" class="notice-bar" data-testid="formula-error">
          <i class="ph ph-warning-circle"></i><span>{{ explanation }}</span>
        </div>
        <div v-else class="explain-text" data-testid="formula-explain">{{ explanation }}</div>

        <div class="dialog-actions">
          <button class="btn" :disabled="status === 'running'" data-testid="formula-regen" @click="runExplain">
            <i class="ph ph-arrow-counter-clockwise"></i> 重新解释
          </button>
          <button class="btn btn-primary" data-testid="formula-close" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.formula-render {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 18px 16px 12px;
  overflow-x: auto;
}
.katex-box :deep(.katex) {
  font-size: 1.15em;
  color: var(--ink);
}
.raw-box {
  font-family: var(--font-serif);
  font-size: 15px;
  color: var(--ink);
  text-align: center;
  padding: 6px 0;
}
.render-hint {
  margin-top: 8px;
  font-size: 10.5px;
  color: var(--ink-3);
  display: flex;
  gap: 5px;
  align-items: center;
}
.formula-src {
  margin-top: 10px;
  font-size: 11px;
  color: var(--ink-3);
  background: var(--surface);
  border-left: 2px solid var(--accent);
  border-radius: 3px;
  padding: 6px 10px;
  line-height: 1.6;
  max-height: 64px;
  overflow-y: auto;
}
.explain-status {
  font-size: 12px;
  color: var(--accent-deep);
  background: var(--accent-wash);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 6px 12px;
}
.explain-text {
  font-size: 12.5px;
  line-height: 1.9;
  color: var(--ink-2);
  white-space: pre-wrap;
  max-height: 240px;
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
