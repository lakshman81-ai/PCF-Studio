import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default {
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: 'index.html'    // Primary entry point (formerly ray.html)
      },
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  }
}
