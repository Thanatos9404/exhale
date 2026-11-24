/**
 * Browser client for Exhale's own server functions. Every JSON body is validated against its
 * schema, so a response of the wrong shape becomes an ApiError instead of reaching the UI.
 */
import type { Place } from './air/types';
import type { Household } from './profile/schema';
import type { ZodType } from 'zod';
import {
  errorBodySchema,
  healthResponseSchema,
  planResponseSchema,
  type ChatMessage,
  type HealthResponse,
  type PlanResponse,
} from './apiTypes';

/** A failed request to Exhale's API, with the server's message and HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Shown when a successful response is not JSON or not the shape the endpoint promises. */
const UNEXPECTED_RESPONSE = 'Unexpected response from the server';

/** The response body as JSON, or undefined when it is not JSON. An aborted read still rejects. */
async function jsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    const body: unknown = JSON.parse(text);
    return body;
  } catch {
    return undefined;
  }
}

async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = errorBodySchema.safeParse(await res.json());
    if (body.success) message = body.data.error;
  } catch {
    /* non-JSON error */
  }
  return new ApiError(message, res.status);
}

/** Parses a successful response with `schema`; a body of any other shape is an ApiError. */
async function parsed<T>(res: Response, schema: ZodType<T>): Promise<T> {
  const body = schema.safeParse(await jsonBody(res));
  if (!body.success) throw new ApiError(UNEXPECTED_RESPONSE, res.status);
  return body.data;
}

/** The place as sent to the server: the label is reduced to the characters the server accepts. */
const placeBody = (p: Place) => ({
  lat: p.lat,
  lon: p.lon,
  label: p.label.replace(/[^\p{L}\p{M}\p{N} .,'()&/-]/gu, '').slice(0, 80) || 'My place',
});

/** Asks the server for a plan for this place and household, with AI wording when available. */
export async function requestPlan(
  place: Place,
  household: Household,
  signal?: AbortSignal,
): Promise<PlanResponse> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: placeBody(place), household }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  return parsed(res, planResponseSchema);
}

/** Server status and the configured AI providers. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw await failure(res);
  return parsed(res, healthResponseSchema);
}

/** Streams the assistant's answer, calling `onChunk` with the text so far. Returns the final text. */
export async function streamChat(
  args: { place: Place; household: Household; messages: ChatMessage[]; search: boolean },
  onChunk: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; source: string }> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...args, place: placeBody(args.place) }),
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(text);
  }
  text += decoder.decode();
  return { text, source: res.headers.get('x-exhale-source') ?? 'unknown' };
}
