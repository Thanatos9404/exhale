/**
 * Local stand-in for Vercel Functions: routes `/api/<name>` to the `POST`/`GET` export of
 * `api/<name>.ts`, using the same Web `Request`/`Response` contract that runs in production.
 * Keeps `npm run dev` a single command.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buffer } from 'node:stream/consumers';
import type { Plugin, ViteDevServer } from 'vite';

type Handler = (request: Request) => Promise<Response>;

function isHandler(value: unknown): value is Handler {
  return typeof value === 'function';
}

/** Only lowercase letters and dashes survive, so a request can never load a file outside `api/`. */
function handlerName(url: string): string {
  const [path = ''] = url.split('?');
  return path.replace(/^\/+/, '').replace(/[^a-z-]/g, '');
}

async function loadHandler(server: ViteDevServer, url: string, method: string) {
  const mod: Record<string, unknown> = await server.ssrLoadModule(`/api/${handlerName(url)}.ts`);
  const candidate = mod[method];
  return isHandler(candidate) ? candidate : null;
}

async function toWebRequest(req: IncomingMessage, method: string): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  const hasBody = method !== 'GET' && method !== 'HEAD';
  // Keep the real host so the API's same-origin check sees what a browser would send.
  const host = req.headers.host ?? 'localhost';
  return new Request(`http://${host}${req.url ?? ''}`, {
    method,
    headers,
    body: hasBody ? await buffer(req) : undefined,
  });
}

/** Copies status, headers and the (possibly streamed) body onto the Node response. */
async function sendWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.body) {
    const reader = response.body.getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      res.write(chunk.value);
    }
  }
  res.end();
}

async function handle(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  const method = (req.method ?? 'GET').toUpperCase();
  const handler = await loadHandler(server, req.url ?? '/', method);
  if (!handler) {
    res.statusCode = 405;
    res.end();
    return;
  }
  await sendWebResponse(await handler(await toWebRequest(req, method)), res);
}

/** A client that navigates away mid-request is normal and must not raise the error overlay. */
function isClientAbort(req: IncomingMessage, err: unknown): boolean {
  return req.destroyed || (err instanceof Error && /abort/i.test(err.message));
}

/** Vite plugin that serves the Vercel function handlers during `vite dev`. */
export function devApi(): Plugin {
  return {
    name: 'exhale-dev-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse, next) => {
        void handle(server, req, res).catch((err: unknown) => {
          if (!isClientAbort(req, err)) {
            next(err);
            return;
          }
          if (!res.writableEnded) res.end();
        });
      });
    },
  };
}
