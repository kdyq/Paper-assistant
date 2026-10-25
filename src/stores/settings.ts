import { defineStore } from 'pinia'

const THEME_KEY = 'shuzhai-theme'

export type Theme = 'light' | 'dark'

/**
 * 应用设置。Step 1 仅含主题；Step 4 扩展 AI 配置（baseUrl/model/apiKey/代理开关），
 * 运行时持久化到 IndexedDB settings 表（key:'app'）。
 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    theme: 'light' as Theme,
  }),
  actions: {
    initTheme() {
      const saved = localStorage.getItem(THEME_KEY)
      this.theme = saved === 'dark' ? 'dark' : 'light'
      this.applyTheme()
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      this.applyTheme()
    },
    applyTheme() {
      document.documentElement.dataset.theme = this.theme
      localStorage.setItem(THEME_KEY, this.theme)
    },
  },
})
