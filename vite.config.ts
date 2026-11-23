/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Local stand-in for Vercel Functions: routes `/api/<name>` to the `POST`/`GET`
 * export of `api/<name>.ts`, using the same Web `Request`/`Response` contract
 * that runs in production. Keeps `npm run dev` a single command.
 */
function devApi(): Plugin {
  return {
    name: 'exhale-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse, next) => {
        void handle(server, req, res).catch((err: unknown) => {
          // A client that navigates away mid-request is normal; do not raise the error overlay for it.
          if (req.destroyed || (err instanceof Error && /abort/i.test(err.message))) {
            if (!res.writableEnded) res.end();
            return;
          }
          next(err);
        });
      });
    },
  };
}

async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  const name = (req.url ?? '/')
    .split('?')[0]!
    .replace(/^\/+/, '')
    .replace(/[^a-z-]/g, '');
  const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<
    string,
    ((r: Request) => Promise<Response>) | undefined
  >;
  const method = (req.method ?? 'GET').toUpperCase();
  const fn = mod[method];
  if (!fn) {
    res.statusCode = 405;
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://localhost${req.url ?? ''}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await fn(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

export default defineConfig(({ mode }) => {
  // Expose server-only secrets (GEMINI_API_KEY) to the dev API handlers, never to the client bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), tailwindcss(), devApi()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      // three.js is ~250 kB gzipped but only loads after first paint, when a 3D view mounts.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks cache across deploys; heavy visuals load on demand.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/](three|@react-three|three-stdlib|camera-controls|maath)[\\/]/.test(id))
              return 'three';
            if (
              /[\\/](react-markdown|remark-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|unified|hast-[^\\/]+|vfile[^\\/]*|unist-[^\\/]+)[\\/]/.test(
                id,
              )
            )
              return 'markdown';
            if (/[\\/]gsap[\\/]|[\\/]@gsap[\\/]/.test(id)) return 'gsap';
            if (/[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id))
              return 'motion';
            if (/[\\/](react|react-dom|scheduler|wouter)[\\/]/.test(id)) return 'react';
            if (/[\\/](@tanstack|zod)[\\/]/.test(id)) return 'data';
            if (/[\\/](cmdk|@radix-ui|sonner)[\\/]/.test(id)) return 'ui';
            return undefined;
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'api/**/*.test.ts'],
      css: false,
      // Page tests render the full app; leave headroom for slow or busy CI machines.
      testTimeout: 20_000,
      coverage: {
        provider: 'v8',
        include: ['src/lib/**', 'server/**', 'api/**'],
        reporter: ['text', 'html'],
      },
    },
  };
});
