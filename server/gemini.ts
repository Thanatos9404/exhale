import { GoogleGenAI, ThinkingLevel, type Content, type GenerateContentConfig } from '@google/genai';
import type { ZodType } from 'zod';

/**
 * Thin wrapper over the Gemini API (Google AI Studio key).
 * - The key is read from the server environment only; it is never sent to the browser.
 * - Models are tried in order. An overloaded or retired model is skipped for a few minutes
 *   (circuit breaker) so one slow model cannot stall every request.
 * - Every call has a per-model timeout and an overall deadline that fits a serverless function.
 * - Every structured response is validated with zod before the app trusts it.
 */

export const DEFAULT_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'] as const;
const PER_MODEL_TIMEOUT_MS = 12_000;
const FIRST_TOKEN_TIMEOUT_MS = 8_000;
const HEDGE_AFTER_MS = 7_000;
const OVERALL_DEADLINE_MS = 40_000;
const COOLDOWN_MS = 3 * 60_000;
/** The engine already did the reasoning; the model only explains, so light thinking halves latency. */
const THINKING = { thinkingLevel: ThinkingLevel.LOW };

/** Minimal surface we use, so tests can pass a fake client. */
export interface GenAiLike {
  models: {
    generateContent: GoogleGenAI['models']['generateContent'];
    generateContentStream: GoogleGenAI['models']['generateContentStream'];
  };
}

let cached: GenAiLike | null | undefined;
const coolingUntil = new Map<string, number>();

export function getClient(): GenAiLike | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  // v1beta carries structured output, search grounding and the -latest model aliases.
  cached = apiKey ? new GoogleGenAI({ apiKey, apiVersion: 'v1beta' }) : null;
  return cached;
}

/** Test hook. */
export function setClient(client: GenAiLike | null | undefined): void {
  cached = client;
  coolingUntil.clear();
}

export function modelChain(now = Date.now()): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const all = [...new Set([...(preferred ? [preferred] : []), ...DEFAULT_MODELS])];
  const ready = all.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // If everything is cooling down, try them all anyway rather than fail outright.
  return ready.length > 0 ? ready : all;
}

function coolDown(model: string) {
  coolingUntil.set(model, Date.now() + COOLDOWN_MS);
}

/** Errors worth retrying on the next model: unknown model, quota, overload, timeouts. */
export function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /404|not found|thinking|no longer available|429|quota|rate|503|overload|high demand|unavailable|500|internal|deadline|timeout|abort/i.test(msg);
}

export interface JsonResult<T> {
  data: T;
  model: string;
}

/**
 * Hedged fan-out: start the first model; if it has not answered within `hedgeAfterMs`, or it
 * fails, start the next one too, and take whichever valid answer lands first. Losers are aborted.
 * This keeps latency near the fastest healthy model when the preferred one is overloaded.
 */
export function hedged<R>(
  models: readonly string[],
  run: (model: string, signal: AbortSignal) => Promise<R>,
  opts: { hedgeAfterMs: number; deadlineMs: number; perAttemptMs: number; rounds?: number; backoffMs?: number },
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
      if (next >= models.length) {
        if (running > 0) return;
        // Overload spikes are short: after a backoff, sweep the chain once more before giving up.
        if (round < (opts.rounds ?? 1)) {
          round++;
          next = 0;
          hedgeTimer = setTimeout(launch, opts.backoffMs ?? 1_500);
          return;
        }
        finish(null);
        return;
      }
      const model = models[next++]!;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, opts.hedgeAfterMs);
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(opts.perAttemptMs)]);
      run(model, signal).then(finish, () => {
        running--;
        launch();
      });
    }
    launch();
  });
}

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  validate: ZodType<T>;
  temperature?: number;
  client?: GenAiLike | null;
  hedgeAfterMs?: number;
}): Promise<JsonResult<T> | null> {
  const client = opts.client === undefined ? getClient() : opts.client;
  if (!client) return null;
  const attempt = async (model: string, signal: AbortSignal): Promise<JsonResult<T>> => {
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
      const res = await client.models.generateContent({ model, contents: opts.prompt, config });
      const parsed = opts.validate.safeParse(JSON.parse(res.text ?? ''));
      if (!parsed.success) throw new SyntaxError(`${model} returned JSON that failed validation`);
      return { data: parsed.data, model };
    } catch (err) {
      if (err instanceof SyntaxError) console.warn(`[exhale] ${err.message}`);
      else if (isRetryable(err) && !signal.aborted) coolDown(model);
      else if (!signal.aborted) console.warn(`[exhale] ${model} failed:`, err instanceof Error ? err.message.slice(0, 200) : 'unknown');
      throw err;
    }
  };
  return hedged(modelChain(), attempt, {
    hedgeAfterMs: opts.hedgeAfterMs ?? HEDGE_AFTER_MS,
    deadlineMs: OVERALL_DEADLINE_MS,
    perAttemptMs: PER_MODEL_TIMEOUT_MS * 2,
    rounds: 3,
    backoffMs: 1_500,
  });
}

export interface StreamOptions {
  system: string;
  contents: Content[];
  search?: boolean;
  client?: GenAiLike | null;
}

/**
 * Streams text chunks. Falls through to the next model only before the first chunk arrives,
 * so a user never sees two half-answers stitched together. Appends web sources when
 * Google Search grounding is on.
 */
export async function* streamText(opts: StreamOptions): AsyncGenerator<string, { model: string } | null> {
  const client = opts.client === undefined ? getClient() : opts.client;
  if (!client) return null;
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  for (const model of modelChain()) {
    if (deadline - Date.now() < 2_000) break;
    let started = false;
    const ctrl = new AbortController();
    // Time-to-first-token budget; cleared once text starts flowing.
    const firstTokenTimer = setTimeout(() => ctrl.abort(new Error('timeout waiting for first token')), FIRST_TOKEN_TIMEOUT_MS);
    const hardStop = setTimeout(() => ctrl.abort(new Error('deadline')), 55_000);
    try {
      const stream = await client.models.generateContentStream({
        model,
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
        const list = [...sources.entries()]
          .slice(0, 5)
          .map(([uri, title]) => `- [${title.replace(/[[\]]/g, '')}](${uri})`)
          .join('\n');
        yield `\n\n**Sources**\n${list}`;
      }
      return { model };
    } catch (err) {
      if (started || !isRetryable(err)) {
        console.warn(`[exhale] stream ${model} failed:`, err instanceof Error ? err.message.slice(0, 200) : 'unknown');
        if (started) yield '\n\n_The answer was cut short. Please ask again._';
        return null;
      }
      // A search-quota error says nothing about the model's health for plain requests.
      const searchQuota = opts.search && /429|quota/i.test(err instanceof Error ? err.message : String(err));
      if (!searchQuota) coolDown(model);
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(hardStop);
    }
  }
  return null;
}
