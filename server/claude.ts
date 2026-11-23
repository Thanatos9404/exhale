import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { createRateLimiter } from './rateLimit.js';
import type { JsonResult } from './gemini.js';

/**
 * Claude Haiku as the second provider. It runs only when every Gemini key and model has failed,
 * so plans and answers stay AI-written through Gemini overloads. A global per-instance budget
 * keeps a burst of traffic from running up the bill.
 */

export const CLAUDE_MODEL = 'claude-haiku-5-5';

/** Minimal surface we use, so tests can pass a fake client. */
export interface ClaudeLike {
  messages: {
    create: Anthropic['messages']['create'];
    stream: Anthropic['messages']['stream'];
  };
}

let cached: ClaudeLike | null | undefined;
const budget = createRateLimiter({ limit: 20, windowMs: 60_000 });

export function getClaude(): ClaudeLike | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  cached = apiKey ? new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 }) : null;
  return cached;
}

/** Test hook. */
export function setClaude(client: ClaudeLike | null | undefined): void {
  cached = client;
  budget.reset();
}

/** Structured outputs need closed objects: add `additionalProperties: false` everywhere. */
export function strictSchema(schema: unknown): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v);
    if (out.type === 'object') out.additionalProperties = false;
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

function withinBudget(): boolean {
  const ok = budget.check('claude').ok;
  if (!ok) console.warn('[exhale] Claude fallback budget reached for this minute');
  return ok;
}

export async function claudeJson<T>(opts: {
  system: string;
  prompt: string;
  jsonSchema: unknown;
  validate: ZodType<T>;
  client?: ClaudeLike | null;
}): Promise<JsonResult<T> | null> {
  const client = opts.client === undefined ? getClaude() : opts.client;
  if (!client || !withinBudget()) return null;
  try {
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4_096,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: strictSchema(opts.jsonSchema) },
      },
    });
    if (res.stop_reason === 'refusal') return null;
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const parsed = opts.validate.safeParse(JSON.parse(text));
    if (!parsed.success) {
      console.warn('[exhale] Claude returned JSON that failed validation');
      return null;
    }
    return { data: parsed.data, model: CLAUDE_MODEL };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn('[exhale] Claude rate limited');
    else if (err instanceof Anthropic.APIError)
      console.warn(`[exhale] Claude API error ${err.status}`);
    else
      console.warn(
        '[exhale] Claude call failed:',
        err instanceof Error ? err.message.slice(0, 160) : 'unknown',
      );
    return null;
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Streams Claude's answer as text deltas. Yields nothing if Claude is unavailable. */
export async function* claudeStream(opts: {
  system: string;
  messages: ChatTurn[];
  client?: ClaudeLike | null;
}): AsyncGenerator<string, boolean> {
  const client = opts.client === undefined ? getClaude() : opts.client;
  if (!client || !withinBudget()) return false;
  let started = false;
  try {
    const stream = client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 2_000,
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: 'low' },
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        started = true;
        yield event.delta.text;
      }
    }
    return started;
  } catch (err) {
    console.warn(
      '[exhale] Claude stream failed:',
      err instanceof Anthropic.APIError ? `status ${err.status}` : 'unknown',
    );
    if (started) yield '\n\n_The answer was cut short. Please ask again._';
    return started;
  }
}
