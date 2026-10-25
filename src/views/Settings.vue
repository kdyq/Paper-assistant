<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { AiError, chat, testConnection, type TestResult } from '../services/ai'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const form = reactive({
  baseUrl: '',
  model: '',
  apiKey: '',
  temperature: 0.3,
})
const proxy = ref(false)
const loaded = ref(false)

const testing = ref(false)
const testResult = ref<TestResult | null>(null)

const streaming = ref(false)
const streamText = ref('')

onMounted(async () => {
  await settings.ensureLoaded()
  form.baseUrl = settings.ai.baseUrl
  form.model = settings.ai.model
  form.apiKey = settings.ai.apiKey
  form.temperature = settings.ai.temperature
  proxy.value = settings.proxy
  loaded.value = true
})

async function save() {
  settings.ai.baseUrl = form.baseUrl.trim()
  settings.ai.model = form.model.trim()
  settings.ai.apiKey = form.apiKey.trim()
  settings.ai.temperature = form.temperature
  settings.proxy = proxy.value
  await settings.save()
}

async function runTest(forceProxy = false) {
  if (testing.value) return
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testConnection(
      {
        baseUrl: form.baseUrl.trim() || undefined,
        model: form.model.trim() || undefined,
        apiKey: form.apiKey.trim() || undefined,
      },
      forceProxy,
    )
  } finally {
    testing.value = false
  }
}

async function runStreamDemo() {
  if (streaming.value) return
  streaming.value = true
  streamText.value = ''
  try {
    await chat([{ role: 'user', content: '直接给出答案，不要思考过程：用约300字介绍朱砂的文化寓意。' }], {
      onDelta: (d) => {
        streamText.value += d
      },
    })
  } catch (e) {
    streamText.value = e instanceof AiError ? `（${e.message}）` : `（${e instanceof Error ? e.message : String(e)}）`
  } finally {
    streaming.value = false
  }
}

function setTheme(t: 'light' | 'dark') {
  settings.theme = t
  settings.applyTheme()
}
</script>

<template>
  <article class="sheet" data-anim="sheet" style="width: min(680px, 100%)">
    <div class="venue">书斋 · 设置</div>
    <h1 class="paper-title">设置</h1>
    <div class="paper-title-zh">AI 服务（OpenAI 协议）与外观</div>

    <template v-if="loaded">
      <div class="sec-label"><span class="sec-num">一</span>AI 服务</div>
      <div class="form-row">
        <label>Base URL</label>
        <input v-model="form.baseUrl" class="field" data-testid="set-baseurl" placeholder="https://…/v1（留空用 .env 默认）" />
      </div>
      <div class="form-row">
        <label>模型</label>
        <input v-model="form.model" class="field" data-testid="set-model" placeholder="模型名（留空用 .env 默认）" />
      </div>
      <div class="form-row">
        <label>API Key</label>
        <input
          v-model="form.apiKey"
          class="field"
          type="password"
          autocomplete="off"
          data-testid="set-key"
          :placeholder="settings.hasEnvKey ? '留空则使用 .env 提供的默认 Key' : 'sk_…（仅存本机 IndexedDB，不入任何导出）'"
        />
      </div>
      <div class="form-row">
        <label>温度</label>
        <input
          v-model.number="form.temperature"
          class="field"
          type="number"
          min="0"
          max="2"
          step="0.1"
          data-testid="set-temp"
          style="max-width: 110px"
        />
        <span style="font-size: 11px; color: var(--ink-3); padding-top: 7px">0 严谨 ↔ 2 发散，默认 0.3</span>
      </div>

      <div class="form-row" style="align-items: center">
        <label>代理</label>
        <label class="chk" style="display: flex; align-items: center; gap: 7px; cursor: pointer">
          <input v-model="proxy" type="checkbox" data-testid="chk-proxy" />
          <span style="font-size: 12px; color: var(--ink-2)">启用本地开发代理（/ai）——浏览器直连被 CORS 拦截时使用</span>
        </label>
      </div>

      <div class="dialog-actions" style="justify-content: flex-start">
        <button class="btn" :disabled="testing" data-testid="btn-test" @click="runTest(false)">
          {{ testing ? '测试中…' : '连接测试（直连）' }}
        </button>
        <button class="btn" :disabled="testing" data-testid="btn-test-proxy" @click="runTest(true)">测试（走代理）</button>
        <button class="btn btn-primary" data-testid="btn-save" @click="save">
          {{ settings.saved ? '已保存 ✓' : '保存设置' }}
        </button>
      </div>
      <div
        v-if="testResult"
        class="notice-bar"
        :class="{ ok: testResult.ok }"
        data-testid="test-result"
        :style="testResult.ok ? { borderColor: 'var(--accent)', background: 'var(--accent-wash)' } : {}"
      >
        <i :class="testResult.ok ? 'ph ph-check-circle' : 'ph ph-warning-circle'"></i>
        <span>{{ testResult.message }}</span>
      </div>

      <div class="sec-label"><span class="sec-num">二</span>流式演示</div>
      <div class="dialog-actions" style="justify-content: flex-start; margin-top: 0">
        <button class="btn" :disabled="streaming" data-testid="btn-stream" @click="runStreamDemo">
          {{ streaming ? '生成中…' : '发送一条流式请求' }}
        </button>
      </div>
      <div v-if="streamText" class="stream-box" data-testid="stream-box">{{ streamText }}<span v-if="streaming" class="caret">▍</span></div>

      <div class="sec-label"><span class="sec-num">三</span>外观</div>
      <div class="dialog-actions" style="justify-content: flex-start; margin-top: 0">
        <button class="btn" :class="{ 'btn-primary': settings.theme === 'light' }" data-testid="btn-theme-light" @click="setTheme('light')">浅色 · 书斋</button>
        <button class="btn" :class="{ 'btn-primary': settings.theme === 'dark' }" data-testid="btn-theme-dark" @click="setTheme('dark')">暗色 · 灯下</button>
      </div>
    </template>

    <div class="page-foot"><span>书斋 · 设置</span><span>密钥只存本机，不入导出</span></div>
  </article>
</template>

<style scoped>
.stream-box {
  margin-top: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 3px;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.caret {
  color: var(--accent);
  animation: blink 0.9s steps(1) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
