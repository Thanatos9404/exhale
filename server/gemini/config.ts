import { ThinkingLevel } from '@google/genai';

/**
 * Every Gemini latency budget in one place. The API functions may run for 60 s (vercel.json), so
 * Gemini gets 45 s at most and the rest is left for the Claude Haiku and offline fallbacks.
 */

/** Base per-attempt budget. A JSON plan attempt gets twice this, because plans are long. */
export const PER_MODEL_TIMEOUT_MS = 12_000;

/** Healthy JSON answers land well inside this; past it a second candidate starts in parallel. */
export const HEDGE_AFTER_MS = 7_000;

/** Total time Gemini may spend on one request before the caller moves to the next provider. */
export const OVERALL_DEADLINE_MS = 45_000;

/** JSON requests sweep the candidate list this many times, because overload spikes are short. */
export const JSON_ROUNDS = 3;

/** Pause before a JSON request sweeps the candidate list again. */
export const JSON_BACKOFF_MS = 1_200;

/** A stream with no text after this is likely stuck behind overload; the next pair is faster. */
export const FIRST_TOKEN_TIMEOUT_MS = 8_000;

/** Hard stop for a stream that has started, so it always ends inside the 60 s function limit. */
export const STREAM_HARD_STOP_MS = 55_000;

/** Streams sweep the candidate list twice: overload spikes usually pass within seconds. */
export const STREAM_SWEEPS = 2;

/** Pause before a stream sweeps the candidate list again. */
export const STREAM_SWEEP_PAUSE_MS = 1_200;

/** A stream attempt is not started with less than this left before the overall deadline. */
export const STREAM_MIN_TIME_LEFT_MS = 2_000;

/** How long a key × model pair that failed with a retryable error is skipped. */
export const COOLDOWN_MS = 3 * 60_000;

/** Quota resets take longer than overload clears, so an exhausted pair is skipped for longer. */
export const QUOTA_COOLDOWN_MS = 10 * 60_000;

/** The engine already did the reasoning; the model only explains, so light thinking halves latency. */
export const THINKING = { thinkingLevel: ThinkingLevel.LOW };
