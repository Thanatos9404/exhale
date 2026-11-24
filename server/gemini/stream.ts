/**
 * Streaming chat answers from Gemini: one key × model pair at a time, moving to the next pair
 * only before the first token, inside the request deadline and the instance's call budget.
 */
import type { Content } from '@google/genai';
import { raceAbort, untilAborted } from '../abortable.js';
import { stageBudget, type Deadline } from '../deadline.js';
import * as log from '../log.js';
import { breaker, slotId } from './breaker.js';
import { takeGeminiCall } from './budget.js';
import { candidates, slotsFor, type Candidate, type GenAiLike } from './candidates.js';
import {
  FIRST_TOKEN_TIMEOUT_MS,
  GROUNDED_DEADLINE_MS,
  OVERALL_DEADLINE_MS,
  STREAM_HARD_STOP_MS,
  STREAM_MIN_TIME_LEFT_MS,
  STREAM_SWEEPS,
  STREAM_SWEEP_PAUSE_MS,
  THINKING,
} from './config.js';
import { isRetryable } from './errors.js';
import { collectSources, formatSources } from './sources.js';

export { formatSources } from './sources.js';

/**
 * One turn of a Gemini conversation: a role and its text parts. Re-exported so API handlers
 * can build conversations without importing the SDK themselves.
 */
export type ChatContent = Content;

export interface StreamOptions {
  system: string;
  contents: ChatContent[];
  /** Ground the answer in Google Search and append the cited sources. */
  search?: boolean;
  /** Omit to use the configured keys; pass a client (tests) or null (no Gemini). */
  client?: GenAiLike | null;
  /** The request's deadline. Gemini gets its own budget or the time left, whichever is smaller. */
  deadline?: Deadline;
  /** Aborts when the reader has gone away, so the upstream call stops too. */
  signal?: AbortSignal;
}

/** The model that finished the answer. */
export interface StreamResult {
  model: string;
}

/** How one attempt ended: an answer or a final failure, or 'next' to try the next pair. */
type AttemptOutcome = StreamResult | null | 'next';

/** The time one attempt may take to start answering, and to finish. */
interface AttemptLimits {
  firstTokenMs: number;
  hardStopMs: number;
}

const CUT_SHORT = '\n\n_The answer was cut short. Please ask again._';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function startStream(c: Candidate, opts: StreamOptions, signal: AbortSignal) {
  return c.client.models.generateContentStream({
    model: c.model,
    contents: opts.contents,
    config: {
      systemInstruction: opts.system,
      temperature: 0.7,
      maxOutputTokens: 1_500,
      thinkingConfig: THINKING,
      abortSignal: signal,
      ...(opts.search ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });
}

/** A failure before the first chunk: bench the pair when the failure is its own, then move on. */
function benchAndMoveOn(
  c: Candidate,
  opts: StreamOptions,
  err: unknown,
  ownClock: boolean,
): 'next' {
  // A search-quota error says nothing about the pair's health for plain requests, and neither
  // does a wait this request cut short because its own deadline was near.
  const searchQuota = opts.search && /429|quota/i.test(log.errorMessage(err, 400));
  if (!searchQuota && !ownClock) breaker.trip(c, err);
  return 'next';
}

/**
 * Streams one pair's answer. Before the first chunk, a retryable failure benches the pair and
 * returns 'next'. After it, any failure ends the answer with a short note instead. A reader that
 * went away ends the attempt silently: nothing failed, so nothing is logged or benched.
 */
async function* streamFrom(
  c: Candidate,
  opts: StreamOptions,
  limits: AttemptLimits,
): AsyncGenerator<string, AttemptOutcome> {
  let started = false;
  const ctrl = new AbortController();
  const tooSlow = new Error('timeout waiting for first token');
  // Time-to-first-token budget; cleared once text starts flowing.
  const firstTokenTimer = setTimeout(() => ctrl.abort(tooSlow), limits.firstTokenMs);
  const hardStop = setTimeout(() => ctrl.abort(new Error('deadline')), limits.hardStopMs);
  const signal = opts.signal ? AbortSignal.any([ctrl.signal, opts.signal]) : ctrl.signal;
  try {
    const stream = await raceAbort(startStream(c, opts, signal), signal);
    const sources = new Map<string, string>();
    for await (const chunk of untilAborted(stream, signal)) {
      const text = chunk.text;
      if (text) {
        clearTimeout(firstTokenTimer);
        started = true;
        yield text;
      }
      collectSources(chunk, sources);
    }
    const cited = formatSources(sources);
    if (cited) yield cited;
    return { model: c.model };
  } catch (err) {
    if (opts.signal?.aborted) return null;
    if (!started && isRetryable(err)) {
      const ownClock = err === tooSlow && limits.firstTokenMs < FIRST_TOKEN_TIMEOUT_MS;
      return benchAndMoveOn(c, opts, err, ownClock);
    }
    log.warn(`stream ${slotId(c)} failed:`, log.errorMessage(err, 200));
    if (started) yield CUT_SHORT;
    return null;
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(hardStop);
    // Stops the upstream call when the reader stopped first; harmless once it has ended.
    ctrl.abort();
  }
}

/** Time this request may spend finding a pair that starts answering. */
function searchBudget(opts: StreamOptions): number {
  return stageBudget(opts.deadline, opts.search ? GROUNDED_DEADLINE_MS : OVERALL_DEADLINE_MS);
}

/** An attempt may wait for its first token until the stage ends, and stream until the request does. */
function limitsFor(opts: StreamOptions, stageLeftMs: number): AttemptLimits {
  return {
    firstTokenMs: Math.min(FIRST_TOKEN_TIMEOUT_MS, Math.max(0, stageLeftMs)),
    hardStopMs: stageBudget(opts.deadline, STREAM_HARD_STOP_MS),
  };
}

/**
 * Streams text chunks. Falls through to the next candidate only before the first chunk arrives,
 * so a user never sees two half-answers stitched together. Appends web sources when
 * Google Search grounding is on. Returns the model that answered, or null when none did: every
 * pair failed, the time ran out, the reader left, or the instance's call budget is spent.
 */
export async function* streamText(
  opts: StreamOptions,
): AsyncGenerator<string, StreamResult | null> {
  const slots = slotsFor(opts.client);
  if (slots.length === 0) return null;
  const startBy = Date.now() + searchBudget(opts);
  const list = candidates(slots);
  const attempts = Array.from({ length: STREAM_SWEEPS }, () => list).flat();
  for (const [i, c] of attempts.entries()) {
    if (startBy - Date.now() < STREAM_MIN_TIME_LEFT_MS || opts.signal?.aborted) break;
    if (breaker.outOfQuota(c)) continue;
    if (i > 0 && i % list.length === 0) await sleep(STREAM_SWEEP_PAUSE_MS);
    // A spent call budget ends the search at once, so the caller moves to the next provider.
    if (!takeGeminiCall()) break;
    const outcome = yield* streamFrom(c, opts, limitsFor(opts, startBy - Date.now()));
    if (outcome !== 'next') return outcome;
  }
  return null;
}
