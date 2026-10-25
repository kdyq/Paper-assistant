<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Paper } from '../../stores/library'

/** 题录编辑弹层：入库前确认 / 之后随时修改 */
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

        <div class="dialog-actions">
          <button class="btn" data-testid="meta-cancel" @click="emit('close')">取消</button>
          <button class="btn btn-primary" data-testid="meta-save" @click="save">保存</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
