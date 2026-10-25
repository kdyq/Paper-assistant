<script setup lang="ts">
import { ref } from 'vue'
import { safeFrom } from '../../utils/anim'

// 右栏伴读面板。Step 1 为骨架 + 空态；提取/问答/笔记分别于 Step 5/6/7 接入。
const tab = ref<'extract' | 'chat' | 'notes'>('extract')

const TABS = [
  { key: 'extract', label: '提取' },
  { key: 'chat', label: '问答' },
  { key: 'notes', label: '笔记' },
] as const

const EXTRACT_CARDS = [
  { num: '一', title: '研究问题' },
  { num: '二', title: '核心方法' },
  { num: '三', title: '实验结果' },
  { num: '四', title: '主要贡献' },
]

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
        <span class="model-chip">deepseek-v4.1-flash</span>
      </div>
      <div class="ai-head-sub">对当前论文提问，回答附原文定位</div>
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
      <div class="ai-panel-pane" :class="{ active: tab === 'extract' }" data-pane="extract">
        <div v-for="c in EXTRACT_CARDS" :key="c.num" class="extract-card" data-anim="card">
          <div class="extract-head">
            <span class="extract-num">{{ c.num }}</span>
            <span class="extract-title">{{ c.title }}</span>
            <span class="extract-loc">待提取</span>
          </div>
          <div class="extract-text text-ink-3">打开文献后，一键提取{{ c.title }}要点。</div>
        </div>
      </div>
      <div class="ai-panel-pane" :class="{ active: tab === 'chat' }" data-pane="chat">
        <div class="chat-item" data-anim="card">
          <div class="chat-avatar ai"><i class="ph ph-pen-nib"></i></div>
          <div class="chat-bubble">
            <div class="who">伴读</div>
            <div class="txt">打开一篇文献后，可直接就内容提问，回答将附 [P.x] 原文定位。</div>
          </div>
        </div>
      </div>
      <div class="ai-panel-pane" :class="{ active: tab === 'notes' }" data-pane="notes">
        <div class="note-card" data-anim="card">
          <div class="note-head"><i class="ph ph-bookmark-simple"></i>笔记</div>
          <div class="note-text text-ink-3">阅读时选中文本即可记笔记，笔记锚定页码与引文，可一键跳回原文。</div>
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
.extract-text.text-ink-3 {
  color: var(--ink-3);
}
.note-text.text-ink-3 {
  color: var(--ink-3);
}
</style>
