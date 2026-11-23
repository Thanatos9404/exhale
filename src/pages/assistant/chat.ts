import { z } from 'zod';
import type { ChatMessage } from '@/lib/apiTypes';

/** Longest question the composer accepts, in characters. */
export const MAX_CHARS = 2000;

/** Messages kept in this browser between visits. */
export const STORED_MESSAGES = 30;

/** Most recent messages sent with each question as conversation context. */
export const CONTEXT_MESSAGES = 16;

/** Shown when the stream ends without any text. */
export const EMPTY_ANSWER = 'No answer came back. Please try again.';

const storedChatSchema = z
  .array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(8000) }))
  .max(STORED_MESSAGES);

/** Validates a stored conversation; null when it is missing, stale or tampered with. */
export function parseChat(raw: unknown): ChatMessage[] | null {
  const r = storedChatSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** True for the error a fetch throws after its AbortController fires. */
export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError';
}
