import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.VITE_API_PORT || 7323

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
