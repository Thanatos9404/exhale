/**
 * Small, dependency-free HTTP helpers shared by the Vercel functions in /api: safe JSON
 * responses, client-safe errors and a JSON body reader with a hard size cap.
 */
import * as log from './log.js';

export { clientKey } from './clientKey.js';

/** Sent on every API response: never cache personal plans, never sniff types, never leak URLs. */
export const SECURITY_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const TOO_LARGE = 'Request body too large';

/** An error whose message is safe to show the client, with its status and extra headers. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** A JSON response with the security headers; `headers` are added last and may override them. */
export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

/** Turns any thrown value into a safe JSON error. Internal details never reach the client. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status, err.headers);
  log.error('unhandled error', log.errorMessage(err));
  return json({ error: 'Something went wrong. Please try again.' }, 500);
}

/**
 * A handler for the methods an endpoint does not support: 405 with an Allow header naming the
 * method that works, as RFC 9110 requires.
 */
export function methodNotAllowed(allow: string): () => Response {
  return () => json({ error: `Use ${allow}` }, 405, { allow });
}

/** The media type without its parameters: "Application/JSON; charset=utf-8" is "application/json". */
function mediaType(header: string | null): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * Reads the body as text, counting bytes as they arrive and stopping at the cap. An oversized
 * body is never held in memory, even when content-length is missing or understates it.
 */
async function readCapped(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, TOO_LARGE);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Reads a JSON body with a hard size cap. Only the exact media type application/json is accepted:
 * a browser cannot send it cross-origin without a preflight, whereas a type that merely contains
 * the words (text/plain; charset=application/json) is CORS-safelisted and any website could post it.
 */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  if (mediaType(request.headers.get('content-type')) !== 'application/json')
    throw new HttpError(415, 'Expected application/json');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, TOO_LARGE);
  const text = await readCapped(request, maxBytes);
  try {
    const body: unknown = JSON.parse(text);
    return body;
  } catch {
    throw new HttpError(400, 'Malformed JSON');
  }
}
