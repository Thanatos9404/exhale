import * as log from './log.js';

/** Small, dependency-free HTTP helpers shared by the Vercel functions in /api. */

/** Sent on every API response: never cache personal plans, never sniff types, never leak URLs. */
export const SECURITY_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

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

/** Reads a JSON body with a hard size cap, rejecting other content types. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json'))
    throw new HttpError(415, 'Expected application/json');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'Request body too large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Malformed JSON');
  }
}

/** Best-effort client key for rate limiting. Vercel sets x-forwarded-for; the first hop is the client. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  // First non-empty value wins: an empty forwarded header falls through to x-real-ip.
  const ip = [forwarded, request.headers.get('x-real-ip')].find(Boolean) ?? 'local';
  return ip.slice(0, 64);
}
