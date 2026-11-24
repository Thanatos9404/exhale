/**
 * Every Gemini latency budget in one place. A request has 50 s in all (../deadline.ts): air data
 * may use 10 s and Gemini 30 s, which leaves Claude Haiku at least 10 s and the offline fallback
 * needs none. Every budget here is a ceiling; the request deadline trims it when less is left.
 */
import { ThinkingLevel } from '@google/genai';

/** Base per-attempt budget. A JSON plan attempt gets twice this, because plans are long. */
export const PER_MODEL_TIMEOUT_MS = 12_000;

/** Healthy JSON answers land well inside this; past it a second candidate starts in parallel. */
export const HEDGE_AFTER_MS = 7_000;

/**
 * Total time Gemini may spend on one request before the caller moves to the next provider.
 * 30 s covers one full-length plan attempt plus three hedges; with the 10 s air budget it leaves
 * Claude Haiku at least 10 s of the 50 s request deadline.
 */
export const OVERALL_DEADLINE_MS = 30_000;

/**
 * Time a search-grounded chat may spend looking for a first token: two first-token waits. If
 * grounding has not started an answer by then it is down, and the plain run still fits.
 */
export const GROUNDED_DEADLINE_MS = 16_000;

/** JSON requests sweep the candidate list this many times, because overload spikes are short. */
export const JSON_ROUNDS = 3;

/** Pause before a JSON request sweeps the candidate list again. */
export const JSON_BACKOFF_MS = 1_200;

/** A stream with no text after this is likely stuck behind overload; the next pair is faster. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/**
 * Hard stop for a stream that has started when no request deadline is given (tests, scripts).
 * Handlers pass their deadline, and the stream then stops when that runs out.
 */
export const STREAM_HARD_STOP_MS = 45_000;

/** Streams sweep the candidate list twice: overload spikes usually pass within seconds. */
export const STREAM_SWEEPS = 2;

/** Pause before a stream sweeps the candidate list again. */
export const STREAM_SWEEP_PAUSE_MS = 1_200;

/** A stream attempt is not started with less than this left of its budget. */
export const STREAM_MIN_TIME_LEFT_MS = 2_000;

/** How long a key × model pair that failed with a retryable error is skipped. */
export const COOLDOWN_MS = 3 * 60_000;

/** Quota resets take longer than overload clears, so an exhausted pair is skipped for longer. */
export const QUOTA_COOLDOWN_MS = 10 * 60_000;

/** The engine already did the reasoning; the model only explains, so light thinking halves latency. */
export const THINKING = { thinkingLevel: ThinkingLevel.LOW };
