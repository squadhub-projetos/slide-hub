import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Bridge de desenvolvimento para as funções /api (produção = Vercel).
 * Sem isto, `vite dev` não serve /api e o modo real de IA nunca alcança
 * a OpenAI localmente — os handlers são carregados via ssrLoadModule e
 * adaptados para (req, res) mínimos.
 */
function devApiPlugin(): Plugin {
  return {
    name: 'slidehub-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const url = req.url ?? ''
          if (!url.startsWith('/api/')) {
            next()
            return
          }
          const route = url.split('?')[0].replace(/^\/api\//, '')
          if (!/^[a-z0-9/_-]+$/i.test(route) || route.includes('..')) {
            res.statusCode = 404
            res.end('{"error":"Rota inválida."}')
            return
          }

          let body: unknown
          if (req.method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(chunk as Buffer)
            const raw = Buffer.concat(chunks).toString('utf8')
            try {
              body = raw ? JSON.parse(raw) : undefined
            } catch {
              body = undefined
            }
          }

          const adapter = {
            status(code: number) {
              res.statusCode = code
              return adapter
            },
            json(payload: unknown) {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(payload))
            },
            setHeader(name: string, value: string) {
              res.setHeader(name, value)
            },
            end(payload?: string) {
              res.end(payload)
            },
          }

          try {
            const mod = await server.ssrLoadModule(`/api/${route}.ts`)
            const handler = (mod as { default?: unknown }).default
            if (typeof handler !== 'function') {
              res.statusCode = 404
              res.setHeader('Content-Type', 'application/json')
              res.end('{"error":"Endpoint não encontrado."}')
              return
            }
            await handler({ method: req.method, body, headers: req.headers }, adapter)
          } catch (error) {
            console.error(`[dev-api] ${route}: ${error instanceof Error ? error.message.slice(0, 300) : 'erro'}`)
            if (!res.writableEnded) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end('{"error":"Falha interna no endpoint de desenvolvimento."}')
            }
          }
        })()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Disponibiliza as variáveis server-side (.env.local) para o bridge dev.
  // Nada disto vai para o bundle do cliente — só VITE_* é exposto pelo Vite.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('VITE_')) process.env[key] ??= value
  }

  return {
    plugins: [react(), devApiPlugin()],
  }
})
