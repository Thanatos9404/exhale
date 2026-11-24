/**
 * Which keys and models Gemini requests may use, and in what order. Keys are read from the server
 * environment only and never sent to the browser. Every key × model pair is a candidate, so one
 * exhausted key or overloaded model never takes the feature down.
 */
import { GoogleGenAI } from '@google/genai';
import { breaker } from './breaker.js';
import { resetGeminiBudget } from './budget.js';

/**
 * Model order when GEMINI_MODEL is unset: the strongest fast model first, then lighter models and
 * the -latest aliases, which tend to keep capacity when a pinned model is overloaded.
 */
export const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
] as const;

/** Minimal surface we use, so tests can pass a fake client. */
export interface GenAiLike {
  models: {
    generateContent: GoogleGenAI['models']['generateContent'];
    generateContentStream: GoogleGenAI['models']['generateContentStream'];
  };
}

/** One configured API key and its client. */
export interface Slot {
  /** Stable, secret-free label for logs and breaker state, e.g. "k1". */
  key: string;
  client: GenAiLike;
}

/** One key × model pair a request can be sent to. */
export interface Candidate extends Slot {
  model: string;
}

let cached: Slot[] | undefined;

/** Unique keys from GEMINI_API_KEYS (comma separated) and GEMINI_API_KEY, in that order. */
export function configuredKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = [...(env.GEMINI_API_KEYS ?? '').split(','), env.GEMINI_API_KEY ?? '']
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

/** One client per configured key, built once per instance. */
function clients(): Slot[] {
  if (cached !== undefined) return cached;
  // v1beta carries structured output, search grounding and the -latest model aliases.
  cached = configuredKeys().map((apiKey, i) => ({
    key: `k${i + 1}`,
    client: new GoogleGenAI({ apiKey, apiVersion: 'v1beta' }),
  }));
  return cached;
}

const single = (client: GenAiLike | null): Slot[] => (client ? [{ key: 'k1', client }] : []);

/**
 * Slots for one request: `undefined` means the configured keys, an explicit client means just
 * that one, and `null` means none (Gemini is treated as not configured).
 */
export function slotsFor(client: GenAiLike | null | undefined): Slot[] {
  return client === undefined ? clients() : single(client);
}

/** The first configured client, or null when no key is set. Used to report availability. */
export function getClient(): GenAiLike | null {
  return clients()[0]?.client ?? null;
}

/** Number of configured keys. Kept server-side: /api/health no longer reports it. */
export function keyCount(): number {
  return clients().length;
}

/**
 * Test hook: replaces the configured clients and clears breaker state and the call budget.
 * `undefined` restores the environment's keys on next use; `null` simulates no key at all.
 */
export function setClient(client: GenAiLike | null | undefined): void {
  cached = client === undefined ? undefined : single(client);
  breaker.reset();
  resetGeminiBudget();
}

/** GEMINI_MODEL first when set, then the defaults, without duplicates. */
export function modelChain(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([...(preferred ? [preferred] : []), ...DEFAULT_MODELS])];
}

/** Model-major order (best model on every key first), skipping pairs that are cooling down. */
export function candidates(slots: readonly Slot[], now = Date.now()): Candidate[] {
  const all = modelChain().flatMap((model) => slots.map((s) => ({ ...s, model })));
  const ready = all.filter((c) => !breaker.isCooling(c, now));
  // If everything is cooling down, try them all anyway rather than fail outright.
  return ready.length > 0 ? ready : all;
}
