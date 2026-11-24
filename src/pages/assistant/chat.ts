/** The assistant's limits, its stored-conversation format and small checks on model output. */
import { z } from 'zod';
import type { ChatMessage } from '@/lib/apiTypes';

/** Longest question the composer accepts, in characters. */
export const MAX_CHARS = 2000;

/** Messages kept in this browser between visits. */
export const STORED_MESSAGES = 30;

/** Most recent messages sent with each question as conversation context. */
export const CONTEXT_MESSAGES = 16;

/** Longest replayed answer the server accepts as context, in characters. */
export const MAX_MODEL_TURN_CHARS = 8000;

/** Longest answer kept in storage; longer than any answer the server streams. */
const MAX_STORED_TEXT_CHARS = 32_000;

/** Shown when the stream ends without any text. */
export const EMPTY_ANSWER = 'No answer came back. Please try again.';

const storedChatSchema = z
  .array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(MAX_STORED_TEXT_CHARS) }))
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

/**
 * An instruction to replace the composer's draft. The id changes with every instruction, so the
 * same text can be applied twice (two sends in a row both empty the box).
 */
export interface DraftReset {
  id: number;
  text: string;
}

/**
 * The address a Markdown link may point to: the normalised URL when it is an absolute `https:`
 * one, otherwise null. Answers are model output, so other schemes and relative paths never
 * become links.
 */
export function httpsUrl(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The turns sent as context with a question: the most recent ones, each clipped to the length
 * the server accepts for its role. Only the request is clipped; the conversation on screen and
 * in storage keeps every answer whole.
 */
export function contextMessages(history: readonly ChatMessage[]): ChatMessage[] {
  return history.slice(-CONTEXT_MESSAGES).map((turn) => {
    const limit = turn.role === 'model' ? MAX_MODEL_TURN_CHARS : MAX_CHARS;
    return turn.text.length > limit ? { ...turn, text: turn.text.slice(0, limit) } : turn;
  });
}
