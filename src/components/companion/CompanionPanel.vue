<script setup lang="ts">
import { computed, watch } from 'vue'
import { ref } from 'vue'
import { useAiStore } from '../../stores/ai'
import { useLibraryStore } from '../../stores/library'
import { useSettingsStore } from '../../stores/settings'
import { safeFrom } from '../../utils/anim'

// 右栏伴读面板：提取（Step 5）/ 问答（Step 6）/ 笔记（Step 7）
const settings = useSettingsStore()
const library = useLibraryStore()
const ai = useAiStore()
const tab = ref<'extract' | 'chat' | 'notes'>('extract')

const paper = computed(() => library.current)
const ex = computed(() => ai.extract)

watch(
  () => library.currentId,
  (id) => {
    if (id) void ai.loadCachedExtract(id)
  },
  { immediate: true },
)

const TABS = [
  { key: 'extract', label: '提取' },
  { key: 'chat', label: '问答' },
  { key: 'notes', label: '笔记' },
] as const

const CARDS = [
  { key: 'question', num: '一', title: '研究问题' },
  { key: 'method', num: '二', title: '核心方法' },
  { key: 'experiment', num: '三', title: '实验结果' },
  { key: 'contribution', num: '四', title: '主要贡献' },
] as const

const cardPage = (k: string) => {
  const p = ex.value.data?.pages?.[k]
  return p ? `P.${p}` : ''
}

const cachedTimeText = computed(() => {
  if (!ex.value.cachedAt) return ''
  const d = new Date(ex.value.cachedAt)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString()
})

function runExtract(regen = false) {
  if (!paper.value) return
  requestAnimationFrame(() => {
    const cards = document.querySelectorAll('[data-pane="extract"] .extract-card')
    if (cards.length) safeFrom(cards, { y: 6, autoAlpha: 0, duration: 0.25, stagger: 0.03 })
  })
  void ai.runExtract(paper.value.id, regen)
}

function switchTab(key: 'extract' | 'chat' | 'notes') {
  if (tab.value === key) return
  tab.value = key
  requestAnimationFrame(() => {
    const pane = document.querySelector(`[data-pane="${key}"]`)
    if (pane) safeFrom(pane.children, { y: 8, autoAlpha: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' })
  })
}
</script>

<template>
  <aside class="ai-panel">
    <div class="ai-head" data-anim="aihead">
      <div class="ai-head-top">
        <span class="ai-head-title">伴读</span>
        <span class="model-chip" data-testid="model-chip">{{ settings.effectiveAi.model || '未配置模型' }}</span>
      </div>
      <div class="ai-head-sub">{{ paper ? paper.title : '对当前论文提问，回答附原文定位' }}</div>
    </div>
    <nav class="ai-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="ai-tab"
        :class="{ active: tab === t.key }"
        :data-testid="`tab-${t.key}`"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </nav>
    <div class="tab-body">
      <!-- ============ 提取 ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'extract' }" data-pane="extract">
        <!-- 无文献 -->
        <template v-if="!paper">
          <div v-for="c in CARDS" :key="c.num" class="extract-card" data-anim="card">
            <div class="extract-head">
              <span class="extract-num">{{ c.num }}</span><span class="extract-title">{{ c.title }}</span>
            </div>
            <div class="extract-text muted">打开文献后，一键提取{{ c.title }}要点。</div>
          </div>
        </template>

        <!-- 扫描版 -->
        <div v-else-if="paper.textEmpty && ex.status === 'idle'" class="notice-bar">
          <i class="ph ph-warning-diamond"></i>
          <span>扫描版文献无文本层，暂不支持 AI 提取（阅读不受影响）。</span>
        </div>

        <!-- 待提取 -->
        <template v-else-if="ex.status === 'idle'">
          <div class="extract-hero" data-testid="extract-hero">
            <i class="ph ph-sparkle"></i>
            <div class="t">一键提取四要素</div>
            <div class="s">研究问题 · 核心方法 · 实验结果 · 主要贡献<br />每项附原文页码出处</div>
            <button class="btn btn-primary" data-testid="btn-extract" @click="runExtract(false)">
              <i class="ph ph-magic-wand"></i> 开始提取
            </button>
          </div>
        </template>

        <!-- 生成中 / 完成 -->
        <template v-else>
          <div v-if="ex.status === 'running'" class="extract-status" data-testid="extract-status">
            <i class="ph ph-circle-notch spin"></i>
            <template v-if="ex.buf.length">朱笔批注中 · {{ ex.buf.length }} 字</template>
            <template v-else-if="ex.reasoningLen">研读原文中 · {{ ex.reasoningLen }} 字</template>
            <template v-else>研读原文中…</template>
          </div>
          <div v-else-if="ex.status === 'error'" class="notice-bar" data-testid="extract-error">
            <i class="ph ph-warning-circle"></i>
            <span>{{ ex.error }}</span>
            <i class="ph ph-arrow-clockwise close" title="重试" @click="runExtract(true)"></i>
          </div>

          <!-- 摘要卡 -->
          <div v-if="ex.data?.summary" class="extract-card" data-anim="card">
            <div class="extract-head">
              <span class="extract-title">摘要</span>
              <span class="extract-loc">{{ cardPage('summary') }}</span>
            </div>
            <div class="extract-text" data-testid="extract-summary">{{ ex.data.summary }}</div>
          </div>

          <!-- 四要素卡 -->
          <div v-for="c in CARDS" :key="c.key" class="extract-card" data-anim="card" :data-testid="`card-${c.key}`">
            <div class="extract-head">
              <span class="extract-num">{{ c.num }}</span>
              <span class="extract-title">{{ c.title }}</span>
              <span class="extract-loc" :data-testid="`loc-${c.key}`">{{ cardPage(c.key) || (ex.status === 'running' ? '…' : '') }}</span>
            </div>
            <div v-if="c.key === 'contribution'" class="extract-text">
              <ol v-if="ex.data?.contribution?.length">
                <li v-for="(item, i) in ex.data.contribution" :key="i">{{ item }}</li>
              </ol>
              <div v-else-if="ex.status === 'running'" class="muted">批注中▍</div>
            </div>
            <div v-else class="extract-text">
              <span v-if="(ex.data as Record<string, unknown>)?.[c.key]" :data-testid="`text-${c.key}`">{{ (ex.data as Record<string, unknown>)[c.key] }}</span>
              <span v-else-if="ex.status === 'running'" class="muted">批注中▍</span>
            </div>
          </div>

          <!-- 完成态脚注 -->
          <div v-if="ex.status === 'done'" class="extract-foot" data-testid="extract-foot">
            <span v-if="ex.degraded" class="warn" data-testid="extract-degraded"><i class="ph ph-warning"></i> 结构化解析失败，已降级为纯文本</span>
            <span v-else class="muted">
              {{ ex.fromCache ? '缓存' : '已生成' }}<template v-if="cachedTimeText"> · {{ cachedTimeText }}</template> · {{ ex.model }}
            </span>
            <button class="tag-add" data-testid="btn-regen" title="重新生成（不计缓存）" @click="runExtract(true)">
              <i class="ph ph-arrow-counter-clockwise" style="font-size: 9px"></i> 重新生成
            </button>
          </div>
        </template>
      </div>

      <!-- ============ 问答（Step 6） ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'chat' }" data-pane="chat">
        <div class="chat-item" data-anim="card">
          <div class="chat-avatar ai"><i class="ph ph-pen-nib"></i></div>
          <div class="chat-bubble">
            <div class="who">伴读</div>
            <div class="txt">打开一篇文献后，可直接就内容提问，回答将附 [P.x] 原文定位。</div>
          </div>
        </div>
      </div>

      <!-- ============ 笔记（Step 7） ============ -->
      <div class="ai-panel-pane" :class="{ active: tab === 'notes' }" data-pane="notes">
        <div class="note-card" data-anim="card">
          <div class="note-head"><i class="ph ph-bookmark-simple"></i>笔记</div>
          <div class="note-text muted">阅读时选中文本即可记笔记，笔记锚定页码与引文，可一键跳回原文。</div>
        </div>
      </div>
    </div>
    <div class="ai-input">
      <div class="ai-input-box">
        <input placeholder="就当前论文提问…" disabled />
        <i class="ph ph-paper-plane-right send"></i>
      </div>
      <div class="ai-input-hint">选中右侧原文后，可直接「解释这段 / 翻译这段」</div>
    </div>
  </aside>
</template>

<style scoped>
.muted {
  color: var(--ink-3);
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
.extract-hero {
  text-align: center;
  padding: 30px 12px 22px;
  border: 1px dashed var(--line);
  border-radius: 3px;
  color: var(--ink-3);
}
.extract-hero i {
  font-size: 26px;
  color: var(--accent);
}
.extract-hero .t {
  font-family: var(--font-serif);
  font-size: 15px;
  color: var(--ink);
  margin: 8px 0 6px;
  letter-spacing: 0.06em;
}
.extract-hero .s {
  font-size: 11.5px;
  line-height: 1.9;
  margin-bottom: 14px;
}
.extract-status {
  font-size: 12px;
  color: var(--accent-deep);
  background: var(--accent-wash);
  border: 1px solid var(--accent);
  border-radius: 3px;
  padding: 6px 12px;
  margin-bottom: 10px;
}
.extract-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 10.5px;
}
.extract-foot .warn {
  color: var(--accent-deep);
}
.extract-foot .tag-add {
  margin-left: auto;
}
</style>
