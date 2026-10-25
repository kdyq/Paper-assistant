import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@phosphor-icons/web/regular/style.css'
import '@phosphor-icons/web/fill/style.css'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia).use(router).mount('#app')

// 仅开发模式：调试口（Playwright/控制台可直接读 store 状态）
if (import.meta.env.DEV) {
  import('./stores/ai').then(({ useAiStore }) => {
    ;(window as unknown as Record<string, unknown>).__ai = useAiStore(pinia)
  })
}
