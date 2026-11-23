import type { GenerateContentConfig } from '@google/genai';
import type { ZodType } from 'zod';
import * as log from '../log.js';
import { breaker, slotId } from './breaker.js';
import { candidates, slotsFor, type Candidate, type GenAiLike } from './candidates.js';
import {
  HEDGE_AFTER_MS,
  JSON_BACKOFF_MS,
  JSON_ROUNDS,
  OVERALL_DEADLINE_MS,
  PER_MODEL_TIMEOUT_MS,
  THINKING,
} from './config.js';
import { isRetryable } from './errors.js';
import { hedged } from './hedged.js';

/** A validated structured answer and the model that wrote it. */
export interface JsonResult<T> {
  data: T;
  model: string;
}

export interface JsonOptions<T> {
  system: string;
  prompt: string;
  /** JSON Schema for Gemini's structured-output mode. */
  jsonSchema: unknown;
  /** Zod schema the answer must pass before the app trusts it. */
  validate: ZodType<T>;
  temperature?: number;
  /** Omit to use the configured keys; pass a client (tests) or null (no Gemini). */
  client?: GenAiLike | null;
  hedgeAfterMs?: number;
  rounds?: number;
  backoffMs?: number;
}

type ConfigInput = Pick<JsonOptions<unknown>, 'system' | 'jsonSchema' | 'temperature'>;

function requestConfig(opts: ConfigInput, signal: AbortSignal): GenerateContentConfig {
  return {
    systemInstruction: opts.system,
    responseMimeType: 'application/json',
    responseJsonSchema: opts.jsonSchema,
    temperature: opts.temperature ?? 0.6,
    maxOutputTokens: 4_096,
    thinkingConfig: THINKING,
    abortSignal: signal,
  };
}

/** Logs a failed attempt and benches the pair when the failure is worth retrying elsewhere. */
function reportFailure(c: Candidate, err: unknown, signal: AbortSignal): void {
  if (err instanceof SyntaxError) log.warn(err.message);
  else if (!signal.aborted && isRetryable(err)) {
    breaker.trip(c, err);
    log.warn(`${slotId(c)} unavailable:`, log.errorMessage(err, 120));
  } else if (!signal.aborted) log.warn(`${slotId(c)} failed:`, log.errorMessage(err, 160));
}

async function attempt<T>(
  c: Candidate,
  opts: JsonOptions<T>,
  signal: AbortSignal,
): Promise<JsonResult<T>> {
  if (breaker.outOfQuota(c)) throw new Error(`${slotId(c)} is out of quota`);
  try {
    const res = await c.client.models.generateContent({
      model: c.model,
      contents: opts.prompt,
      config: requestConfig(opts, signal),
    });
    const parsed = opts.validate.safeParse(JSON.parse(res.text ?? ''));
    if (!parsed.success) throw new SyntaxError(`${c.model} returned JSON that failed validation`);
    return { data: parsed.data, model: c.model };
  } catch (err) {
    reportFailure(c, err, signal);
    throw err;
  }
}

/**
 * Asks Gemini for JSON that matches `jsonSchema` and passes `validate`, hedging across every
 * key × model pair. Resolves null when nothing valid arrives within the overall deadline, so the
 * caller can fall back to Claude Haiku and then to the engine's own words.
 */
export async function generateJson<T>(opts: JsonOptions<T>): Promise<JsonResult<T> | null> {
  const slots = slotsFor(opts.client);
  if (slots.length === 0) return null;
  return hedged(candidates(slots), (c, signal) => attempt(c, opts, signal), {
    hedgeAfterMs: opts.hedgeAfterMs ?? HEDGE_AFTER_MS,
    deadlineMs: OVERALL_DEADLINE_MS,
    perAttemptMs: PER_MODEL_TIMEOUT_MS * 2,
    rounds: opts.rounds ?? JSON_ROUNDS,
    backoffMs: opts.backoffMs ?? JSON_BACKOFF_MS,
  });
}
