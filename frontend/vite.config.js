import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dockerfile 环境配置 (npm run preview)
  preview: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // 代理 API 请求到后端服务
      '/api': {
        target: 'http://192.168.0.110:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 代理 konachan 图片请求
      '/konachan-proxy': {
        target: 'https://konachan.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/konachan-proxy/, ''),
        headers: {
          'Referer': 'https://konachan.net'
        }
      }
    }
  },
  // 开发环境配置 (npm run dev)
  server: {
    proxy: {
      // 代理 API 请求到后端服务（开发环境）
      '/api': {
        target: 'http://192.168.0.110:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // 代理 konachan 图片请求
      '/konachan-proxy': {
        target: 'https://konachan.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/konachan-proxy/, ''),
        headers: {
          'Referer': 'https://konachan.net'
        }
      }
    }
  }
})
