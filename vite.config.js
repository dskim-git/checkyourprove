import { defineConfig, loadEnv } from 'vite'

// 로컬 개발 서버에서 api/*.js(Vercel Functions)를 그대로 불러 주는 개발 전용 중계.
// 배포에서는 Vercel이 api/ 폴더를 함수로 만든다. 서버 비밀 값(FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS,
// ADMIN_EMAILS)은 .env.local에서 읽어 process.env에 넣는다(VITE_가 아니므로 브라우저 번들에는 들어가지 않는다).
function devApi(env) {
  return {
    name: 'checkyourprove-dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.entries(env).forEach(([k, v]) => {
        if (process.env[k] === undefined) process.env[k] = v
      })
      server.middlewares.use('/api', async (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\/+/, '')
        if (!/^[\w-]+$/.test(name)) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          await mod.default(req, res)
        } catch (error) {
          console.error(error)
          res.statusCode = 500
          res.end(JSON.stringify({ error: '개발 서버에서 함수를 실행하지 못했어요.' }))
        }
      })
    },
  }
}

// demo.html: 시연 모드(브라우저 저장만, 서버와 따로). 같은 코드를 쓰고 <html data-app-mode="demo">로 구분한다.
export default defineConfig(({ mode }) => ({
  plugins: [devApi(loadEnv(mode, process.cwd(), ''))],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        demo: 'demo.html',
      },
    },
  },
}))
