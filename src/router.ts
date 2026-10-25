import { createRouter, createWebHashHistory } from 'vue-router'
import ReaderView from './views/Reader.vue'

// hash 路由：纯本地应用，无服务器路径回退问题
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'reader', component: ReaderView },
    { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue') },
    { path: '/compare', name: 'compare', component: () => import('./views/Compare.vue') },
    { path: '/search', name: 'search', component: () => import('./views/Search.vue') },
  ],
})

export default router
