import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
} from '@google/genai';
import type { ZodType } from 'zod';

/**
 * Thin wrapper over the Gemini API (Google AI Studio keys).
 * - Keys are read from the server environment only; they are never sent to the browser.
 * - Several keys can be configured (GEMINI_API_KEYS, comma separated). Every key × model pair is
 *   a candidate, so one exhausted key or overloaded model never takes the feature down.
 * - A pair that fails is skipped for a few minutes (circuit breaker); quota errors for longer.
 * - Every call has a per-attempt timeout and an overall deadline that fits a serverless function.
 * - Every structured response is validated with zod before the app trusts it.
 */

export const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
] as const;
const PER_MODEL_TIMEOUT_MS = 12_000;
const FIRST_TOKEN_TIMEOUT_MS = 8_000;
const HEDGE_AFTER_MS = 7_000;
const OVERALL_DEADLINE_MS = 45_000;
const COOLDOWN_MS = 3 * 60_000;
const QUOTA_COOLDOWN_MS = 10 * 60_000;
/** The engine already did the reasoning; the model only explains, so light thinking halves latency. */
const THINKING = { thinkingLevel: ThinkingLevel.LOW };

/** Minimal surface we use, so tests can pass a fake client. */
export interface GenAiLike {
  models: {
    generateContent: GoogleGenAI['models']['generateContent'];
    generateContentStream: GoogleGenAI['models']['generateContentStream'];
  };
}

interface Slot {
  /** Stable, secret-free label for logs and breaker state, e.g. "k1". */
  key: string;
  client: GenAiLike;
}

export interface Candidate extends Slot {
  model: string;
}

let cached: Slot[] | undefined;
const coolingUntil = new Map<string, number>();
const quotaUntil = new Map<string, number>();
const slotId = (c: Pick<Candidate, 'key' | 'model'>) => `${c.key}/${c.model}`;

/** Unique keys from GEMINI_API_KEYS (comma separated) and GEMINI_API_KEY, in that order. */
export function configuredKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = [...(env.GEMINI_API_KEYS ?? '').split(','), env.GEMINI_API_KEY ?? '']
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

function clients(): Slot[] {
  if (cached !== undefined) return cached;
  // v1beta carries structured output, search grounding and the -latest model aliases.
  cached = configuredKeys().map((apiKey, i) => ({
    key: `k${i + 1}`,
    client: new GoogleGenAI({ apiKey, apiVersion: 'v1beta' }),
  }));
  return cached;
}

export function getClient(): GenAiLike | null {
  return clients()[0]?.client ?? null;
}

export function keyCount(): number {
  return clients().length;
}

/** Test hook. */
export function setClient(client: GenAiLike | null | undefined): void {
  cached = client === undefined ? undefined : client ? [{ key: 'k1', client }] : [];
  coolingUntil.clear();
  quotaUntil.clear();
}

export function modelChain(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([...(preferred ? [preferred] : []), ...DEFAULT_MODELS])];
}

/** Model-major order (best model on every key first), skipping pairs that are cooling down. */
export function candidates(slots: readonly Slot[], now = Date.now()): Candidate[] {
  const all = modelChain().flatMap((model) => slots.map((s) => ({ ...s, model })));
  const ready = all.filter((c) => (coolingUntil.get(slotId(c)) ?? 0) <= now);
  // If everything is cooling down, try them all anyway rather than fail outright.
  return ready.length > 0 ? ready : all;
}

function coolDown(c: Candidate, err?: unknown) {
  const quota = /429|quota|exhausted/i.test(err instanceof Error ? err.message : String(err ?? ''));
  if (quota) quotaUntil.set(slotId(c), Date.now() + QUOTA_COOLDOWN_MS);
  coolingUntil.set(slotId(c), Date.now() + (quota ? QUOTA_COOLDOWN_MS : COOLDOWN_MS));
}

/** True while a key × model pair is known to be out of quota; skipping it saves requests. */
export function outOfQuota(c: Pick<Candidate, 'key' | 'model'>, now = Date.now()): boolean {
  return (quotaUntil.get(slotId(c)) ?? 0) > now;
}

/** Errors worth retrying elsewhere: unknown model, quota, overload, timeouts. */
export function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /404|not found|thinking|no longer available|429|quota|rate|503|overload|high demand|unavailable|500|internal|deadline|timeout|abort/i.test(
    msg,
  );
}

export interface JsonResult<T> {
  data: T;
  model: string;
}

/**
 * Hedged fan-out: start the first candidate; if it has not answered within `hedgeAfterMs`, or it
 * fails, start the next one too, and take whichever valid answer lands first. Losers are aborted.
 * This keeps latency near the fastest healthy option when the preferred one is overloaded.
 */
export function hedged<C, R>(
  items: readonly C[],
  run: (item: C, signal: AbortSignal) => Promise<R>,
  opts: {
    hedgeAfterMs: number;
    deadlineMs: number;
    perAttemptMs: number;
    rounds?: number;
    backoffMs?: number;
  },
): Promise<R | null> {
  return new Promise((resolve) => {
    const controllers: AbortController[] = [];
    let next = 0;
    let running = 0;
    let round = 1;
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish(null), opts.deadlineMs);
    function finish(value: R | null) {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      clearTimeout(deadline);
      controllers.forEach((c) => c.abort());
      resolve(value);
    }
    function launch() {
      if (settled) return;
      if (next >= items.length) {
        if (running > 0) return;
        // Overload spikes are short: after a backoff, sweep the list once more before giving up.
        if (round < (opts.rounds ?? 1)) {
          round++;
          next = 0;
          hedgeTimer = setTimeout(launch, opts.backoffMs ?? 1_500);
          return;
        }
        finish(null);
        return;
      }
      const item = items[next++]!;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, opts.hedgeAfterMs);
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(opts.perAttemptMs)]);
      run(item, signal).then(finish, () => {
        running--;
        launch();
      });
    }
    launch();
  });
}

const errText = (err: unknown, n = 160) =>
  err instanceof Error ? err.message.slice(0, n) : 'unknown';

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  validate: ZodType<T>;
  temperature?: number;
  client?: GenAiLike | null;
  hedgeAfterMs?: number;
  rounds?: number;
  backoffMs?: number;
}): Promise<JsonResult<T> | null> {
  const slots =
    opts.client === undefined ? clients() : opts.client ? [{ key: 'k1', client: opts.client }] : [];
  if (slots.length === 0) return null;
  const attempt = async (c: Candidate, signal: AbortSignal): Promise<JsonResult<T>> => {
    if (outOfQuota(c)) throw new Error(`${slotId(c)} is out of quota`);
    const config: GenerateContentConfig = {
      systemInstruction: opts.system,
      responseMimeType: 'application/json',
      responseJsonSchema: opts.jsonSchema,
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: 4_096,
      thinkingConfig: THINKING,
      abortSignal: signal,
    };
    try {
      const res = await c.client.models.generateContent({
        model: c.model,
        contents: opts.prompt,
        config,
      });
      const parsed = opts.validate.safeParse(JSON.parse(res.text ?? ''));
      if (!parsed.success) throw new SyntaxError(`${c.model} returned JSON that failed validation`);
      return { data: parsed.data, model: c.model };
    } catch (err) {
      if (err instanceof SyntaxError) console.warn(`[exhale] ${err.message}`);
      else if (!signal.aborted && isRetryable(err)) {
        coolDown(c, err);
        console.warn(`[exhale] ${slotId(c)} unavailable:`, errText(err, 120));
      } else if (!signal.aborted) console.warn(`[exhale] ${slotId(c)} failed:`, errText(err));
      throw err;
    }
  };
  return hedged(candidates(slots), attempt, {
    hedgeAfterMs: opts.hedgeAfterMs ?? HEDGE_AFTER_MS,
    deadlineMs: OVERALL_DEADLINE_MS,
    perAttemptMs: PER_MODEL_TIMEOUT_MS * 2,
    rounds: opts.rounds ?? 3,
    backoffMs: opts.backoffMs ?? 1_200,
  });
}

export interface StreamOptions {
  system: string;
  contents: Content[];
  search?: boolean;
  client?: GenAiLike | null;
}

/**
 * Streams text chunks. Falls through to the next candidate only before the first chunk arrives,
 * so a user never sees two half-answers stitched together. Appends web sources when
 * Google Search grounding is on.
 */
export async function* streamText(
  opts: StreamOptions,
): AsyncGenerator<string, { model: string } | null> {
  const slots =
    opts.client === undefined ? clients() : opts.client ? [{ key: 'k1', client: opts.client }] : [];
  if (slots.length === 0) return null;
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const list = candidates(slots);
  // Two sweeps: overload spikes usually pass within seconds.
  const attempts = [...list, ...list];
  for (const [i, c] of attempts.entries()) {
    if (deadline - Date.now() < 2_000) break;
    if (outOfQuota(c)) continue;
    if (i > 0 && i % list.length === 0) await new Promise((res) => setTimeout(res, 1_200));
    let started = false;
    const ctrl = new AbortController();
    // Time-to-first-token budget; cleared once text starts flowing.
    const firstTokenTimer = setTimeout(
      () => ctrl.abort(new Error('timeout waiting for first token')),
      FIRST_TOKEN_TIMEOUT_MS,
    );
    const hardStop = setTimeout(() => ctrl.abort(new Error('deadline')), 55_000);
    try {
      const stream = await c.client.models.generateContentStream({
        model: c.model,
        contents: opts.contents,
        config: {
          systemInstruction: opts.system,
          temperature: 0.7,
          maxOutputTokens: 1_500,
          thinkingConfig: THINKING,
          abortSignal: ctrl.signal,
          ...(opts.search ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      const sources = new Map<string, string>();
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          if (!started) clearTimeout(firstTokenTimer);
          started = true;
          yield text;
        }
        for (const g of chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
          if (g.web?.uri) sources.set(g.web.uri, g.web.title ?? g.web.uri);
        }
      }
      if (sources.size > 0) {
        const links = [...sources.entries()]
          .slice(0, 5)
          .map(([uri, title]) => `- [${title.replace(/[[\]]/g, '')}](${uri})`)
          .join('\n');
        yield `\n\n**Sources**\n${links}`;
      }
      return { model: c.model };
    } catch (err) {
      if (started || !isRetryable(err)) {
        console.warn(`[exhale] stream ${slotId(c)} failed:`, errText(err, 200));
        if (started) yield '\n\n_The answer was cut short. Please ask again._';
        return null;
      }
      // A search-quota error says nothing about the pair's health for plain requests.
      const searchQuota = opts.search && /429|quota/i.test(errText(err, 400));
      if (!searchQuota) coolDown(c, err);
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(hardStop);
    }
  }
  return null;
}
