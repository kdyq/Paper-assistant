import { defineStore } from 'pinia'
import { dbGet, dbPut } from '../services/db'

const THEME_KEY = 'shuzhai-theme'

export type Theme = 'light' | 'dark'

export interface AiConfig {
  baseUrl: string
  model: string
  apiKey: string // 运行时覆盖值；空串表示回退 .env 默认 key
  temperature: number
}

/** .env 注入的默认值（VITE_ 前缀；本应用纯本地无部署，风险已知且可接受） */
const ENV_DEFAULTS = {
  baseUrl: (import.meta.env.VITE_AI_BASE_URL as string | undefined) ?? '',
  model: (import.meta.env.VITE_AI_MODEL as string | undefined) ?? '',
  apiKey: (import.meta.env.VITE_AI_API_KEY as string | undefined) ?? '',
}

interface StoredSettings {
  key: 'app'
  ai: AiConfig
  proxy: boolean
  theme: Theme
}

/**
 * 应用设置：主题（localStorage）+ AI 配置与代理开关（IndexedDB settings）。
 * 设置页输入的 key 运行时覆盖 .env 默认值。
 */
export const useSettingsStore = defineStore('settings', {
  state: () => ({
    theme: 'light' as Theme,
    ai: {
      baseUrl: ENV_DEFAULTS.baseUrl,
      model: ENV_DEFAULTS.model,
      apiKey: '',
      temperature: 0.3,
    } as AiConfig,
    proxy: false,
    loaded: false,
    saved: false, // 「已保存」提示
  }),
  getters: {
    /** 合并 .env 默认值后的生效配置（空字段回退 env） */
    effectiveAi(state): AiConfig {
      return {
        baseUrl: state.ai.baseUrl || ENV_DEFAULTS.baseUrl,
        model: state.ai.model || ENV_DEFAULTS.model,
        apiKey: state.ai.apiKey || ENV_DEFAULTS.apiKey,
        temperature: state.ai.temperature,
      }
    },
    hasEnvKey: () => !!ENV_DEFAULTS.apiKey,
  },
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

    async ensureLoaded() {
      if (this.loaded) return
      const row = await dbGet<StoredSettings>('settings', 'app')
      if (row) {
        // 逐字段覆盖，避免旧记录缺字段
        this.ai = { ...this.ai, ...row.ai }
        this.proxy = !!row.proxy
      }
      this.loaded = true
    },

    async save() {
      const row: StoredSettings = { key: 'app', ai: { ...this.ai }, proxy: this.proxy, theme: this.theme }
      await dbPut('settings', row)
      this.saved = true
      setTimeout(() => (this.saved = false), 1600)
    },
  },
})
