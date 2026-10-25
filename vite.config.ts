import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // 本地开发代理兜底：浏览器直连 AI 服务被 CORS 拦截时，在设置页开启 /ai 代理
    proxy: {
      '/ai': {
        target: 'https://tokenrhythm.studio',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ai/, '/v1'),
      },
    },
  },
})
