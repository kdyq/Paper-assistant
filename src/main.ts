import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import '@phosphor-icons/web/regular/style.css'
import './styles/tokens.css'

createApp(App).use(createPinia()).use(router).mount('#app')
