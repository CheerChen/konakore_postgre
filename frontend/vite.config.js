import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// API target is read from frontend/.env (VITE_API_TARGET).
// Falls back to the pi host for local dev; see .env.example.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://192.168.0.110:3001'

  return {
    plugins: [react()],
    // Dockerfile 环境配置 (npm run preview)
    preview: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        // 代理 API 请求到后端服务
        '/api': {
          target: 'http://api:3000',
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
        // 代理 API 请求到后端服务（target 由 frontend/.env 的 VITE_API_TARGET 控制）
        '/api': {
          target: apiTarget,
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
  }
})
