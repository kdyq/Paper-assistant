<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { toApa, toGbT7714 } from '../../services/citation'
import { copyText } from '../../services/export'
import type { Paper } from '../../stores/library'

/** 题录编辑弹层：入库前确认 / 之后随时修改；附 APA 与 GB/T 7714 引文（Step 16） */
const props = defineProps<{
  paper: Paper
  subtitle?: string
}>()

const emit = defineEmits<{
  close: []
  save: [patch: Partial<Paper>]
}>()

const form = reactive({
  title: '',
  titleZh: '',
  authors: '',
  year: '',
  venue: '',
  doi: '',
  tags: '',
})

watch(
  () => props.paper.id,
  () => {
    form.title = props.paper.title
    form.titleZh = props.paper.titleZh ?? ''
    form.authors = props.paper.authors.join(', ')
    form.year = props.paper.year ? String(props.paper.year) : ''
    form.venue = props.paper.venue ?? ''
    form.doi = props.paper.doi ?? ''
    form.tags = props.paper.tags.join(', ')
  },
  { immediate: true },
)

/** 引文按表单当前值实时预览 */
const citationBase = computed(() => ({
  ...props.paper,
  title: form.title.trim() || props.paper.title,
  authors: form.authors
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean),
  year: form.year && /^(19|20)\d{2}$/.test(form.year.trim()) ? Number(form.year.trim()) : undefined,
  venue: form.venue.trim() || undefined,
  doi: form.doi.trim() || undefined,
}))
const apaText = computed(() => toApa(citationBase.value))
const gbText = computed(() => toGbT7714(citationBase.value))
const copied = reactive({ apa: false, gb: false })

async function copyCitation(kind: 'apa' | 'gb') {
  const ok = await copyText(kind === 'apa' ? apaText.value : gbText.value)
  if (ok) {
    copied[kind] = true
    setTimeout(() => (copied[kind] = false), 1600)
  }
}

function save() {
  emit('save', {
    title: form.title.trim() || props.paper.title,
    titleZh: form.titleZh.trim() || undefined,
    authors: form.authors
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean),
    year: form.year && /^(19|20)\d{2}$/.test(form.year.trim()) ? Number(form.year.trim()) : undefined,
    venue: form.venue.trim() || undefined,
    doi: form.doi.trim() || undefined,
    tags: form.tags
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean),
  })
}
</script>

<template>
  <teleport to="body">
    <div class="dialog-mask" data-testid="meta-dialog" @click.self="emit('close')">
      <div class="dialog">
        <div class="dialog-title">题录信息</div>
        <div class="dialog-sub">{{ subtitle ?? paper.fileName }} · 共 {{ paper.totalPages }} 页</div>

        <div class="form-row">
          <label>标题</label>
          <input v-model="form.title" class="field" data-testid="meta-title" placeholder="文献标题" />
        </div>
        <div class="form-row">
          <label>中文题</label>
          <input v-model="form.titleZh" class="field" placeholder="中文译题（可选）" />
        </div>
        <div class="form-row">
          <label>作者</label>
          <input v-model="form.authors" class="field" placeholder="逗号或顿号分隔" />
        </div>
        <div class="form-row">
          <label>年份</label>
          <input v-model="form.year" class="field" placeholder="如 2023" inputmode="numeric" />
        </div>
        <div class="form-row">
          <label>出处</label>
          <input v-model="form.venue" class="field" placeholder="会议 / 期刊（可选）" />
        </div>
        <div class="form-row">
          <label>DOI</label>
          <input v-model="form.doi" class="field" placeholder="10.xxxx/xxxx（可选）" />
        </div>
        <div class="form-row">
          <label>标签</label>
          <input v-model="form.tags" class="field" placeholder="逗号分隔，如: 扩散模型, 图像修复" />
        </div>

        <!-- 引文（Step 16）：按当前表单实时生成 -->
        <div class="form-row" style="flex-direction: column; align-items: stretch; gap: 6px">
          <div class="cite-box">
            <div class="cite-head">
              <span>APA 7</span>
              <button class="tag-add" data-testid="cite-copy-apa" @click="copyCitation('apa')">
                {{ copied.apa ? '已复制 ✓' : '复制' }}
              </button>
            </div>
            <div class="cite-text" data-testid="cite-apa">{{ apaText }}</div>
          </div>
          <div class="cite-box">
            <div class="cite-head">
              <span>GB/T 7714</span>
              <button class="tag-add" data-testid="cite-copy-gb" @click="copyCitation('gb')">
                {{ copied.gb ? '已复制 ✓' : '复制' }}
              </button>
            </div>
            <div class="cite-text" data-testid="cite-gb">{{ gbText }}</div>
          </div>
        </div>

        <div class="dialog-actions">
          <button class="btn" data-testid="meta-cancel" @click="emit('close')">取消</button>
          <button class="btn btn-primary" data-testid="meta-save" @click="save">保存</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.cite-box {
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  padding: 8px 11px;
}
.cite-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ink-2);
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.cite-text {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-2);
  word-break: break-all;
}
</style>
