import { GoogleGenAI, type Content, type GenerateContentConfig } from '@google/genai';
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
const OVERALL_DEADLINE_MS = 40_000;
const COOLDOWN_MS = 3 * 60_000;

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
  return /404|not found|no longer available|429|quota|rate|503|overload|high demand|unavailable|500|internal|deadline|timeout|abort/i.test(msg);
}

export interface JsonResult<T> {
  data: T;
  model: string;
}

export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  validate: ZodType<T>;
  temperature?: number;
  client?: GenAiLike | null;
}): Promise<JsonResult<T> | null> {
  const client = opts.client === undefined ? getClient() : opts.client;
  if (!client) return null;
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  for (const model of modelChain()) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    try {
      const config: GenerateContentConfig = {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        responseJsonSchema: opts.jsonSchema,
        temperature: opts.temperature ?? 0.6,
        maxOutputTokens: 4_096,
        abortSignal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS * 2, left)),
      };
      const res = await client.models.generateContent({ model, contents: opts.prompt, config });
      const parsed = opts.validate.safeParse(JSON.parse(res.text ?? ''));
      if (parsed.success) return { data: parsed.data, model };
      console.warn(`[exhale] ${model} returned JSON that failed validation`);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      if (!isRetryable(err)) {
        console.warn(`[exhale] ${model} failed:`, err instanceof Error ? err.message.slice(0, 200) : 'unknown');
        return null;
      }
      coolDown(model);
    }
  }
  return null;
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
    const firstTokenTimer = setTimeout(() => ctrl.abort(new Error('timeout waiting for first token')), PER_MODEL_TIMEOUT_MS);
    const hardStop = setTimeout(() => ctrl.abort(new Error('deadline')), 55_000);
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents: opts.contents,
        config: {
          systemInstruction: opts.system,
          temperature: 0.7,
          maxOutputTokens: 1_500,
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
      coolDown(model);
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(hardStop);
    }
  }
  return null;
}
