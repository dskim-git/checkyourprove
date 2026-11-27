import { defineConfig } from 'vite'

// demo.html: 시연 모드(브라우저 저장만, 서버와 따로). 같은 코드를 쓰고 <html data-app-mode="demo">로 구분한다.
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        demo: 'demo.html',
      },
    },
  },
})
