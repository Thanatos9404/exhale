import type { Place } from './air/types';
import type { Household } from './profile/schema';
import type { ChatMessage, HealthResponse, PlanResponse } from './apiTypes';

/** Browser client for Exhale's own server functions. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* non-JSON error */
  }
  return new ApiError(message, res.status);
}

const placeBody = (p: Place) => ({ lat: p.lat, lon: p.lon, label: p.label.replace(/[^\p{L}\p{N} .,'()&/-]/gu, '').slice(0, 80) || 'My place' });

export async function requestPlan(place: Place, household: Household, signal?: AbortSignal): Promise<PlanResponse> {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ place: placeBody(place), household }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as PlanResponse;
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as HealthResponse;
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
