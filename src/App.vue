<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CompanionPanel from './components/companion/CompanionPanel.vue'
import PageHud from './components/reader/PageHud.vue'
import ShelfPanel from './components/shelf/ShelfPanel.vue'
import { useReaderStore } from './stores/reader'
import { useSettingsStore } from './stores/settings'
import { safeTimeline } from './utils/anim'

const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()
const reader = useReaderStore()

/* 全局快捷键（Step 8）：←/→ 翻页、Ctrl K 聚焦搜索 */
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    void router.push('/search')
    return
  }
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if (route.name !== 'reader' || !reader.ready || reader.error) return
  if (e.key === 'ArrowLeft') void reader.prevPage()
  else if (e.key === 'ArrowRight') void reader.nextPage()
}

onMounted(async () => {
  settings.initTheme()
  window.addEventListener('keydown', onKeydown)
  await nextTick() // 等首屏内容就绪，避免 GSAP 对不存在目标告警
  // 入场编排（§3.4：from + clearProps 双兜底，reduced-motion 不动）
  safeTimeline((tl) => {
    tl.from('[data-anim="topbar"]', { y: -10, autoAlpha: 0, duration: 0.32 })
      .from('.lib-item, [data-anim="lib-empty"]', { x: -8, autoAlpha: 0, stagger: 0.035 }, '-=.15')
      .from('[data-anim="sheet"]', { y: 12, autoAlpha: 0, duration: 0.42 }, '<')
      .from('[data-anim="aihead"]', { y: -6, autoAlpha: 0, duration: 0.28 }, '-=.3')
      .from('[data-anim="card"]', { y: 7, autoAlpha: 0, stagger: 0.04 }, '-=.25')
      .from('[data-anim="hud"]', { y: 8, autoAlpha: 0, duration: 0.28 }, '-=.28')
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header class="topbar" data-anim="topbar">
    <div class="brand">
      <div class="seal">阅</div>
      <div>
        <div class="brand-name">书斋</div>
        <div class="brand-sub">文献阅读助手</div>
      </div>
    </div>
    <div class="search" data-testid="search-box" title="全文检索（Ctrl K）" @click="router.push('/search')">
      <i class="ph ph-magnifying-glass"></i>
      <span>检索书架与全文</span>
      <kbd>Ctrl K</kbd>
    </div>
    <div class="topbar-right">
      <router-link to="/compare" class="icon-btn" title="文献对比矩阵" data-testid="btn-compare">
        <i class="ph ph-scales"></i>
      </router-link>
      <router-link to="/settings" class="icon-btn" title="设置" data-testid="btn-settings">
        <i class="ph ph-gear-six"></i>
      </router-link>
      <button
        class="icon-btn"
        id="themeBtn"
        title="切换明暗"
        data-testid="btn-theme"
        @click="settings.toggleTheme()"
      >
        <i class="ph ph-sun icon-sun"></i><i class="ph ph-moon icon-moon"></i>
      </button>
    </div>
  </header>

  <div class="layout" :class="{ 'no-companion': route.name !== 'reader' }">
    <aside class="library">
      <ShelfPanel />
    </aside>
    <main class="reading-col">
      <div class="reading">
        <router-view />
      </div>
      <!-- 独立 HUD 底栏：不随内容滚动、不遮挡正文 -->
      <PageHud v-if="route.name === 'reader'" />
    </main>
    <CompanionPanel v-if="route.name === 'reader'" />
  </div>
</template>
