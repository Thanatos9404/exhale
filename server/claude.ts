/**
 * Claude Haiku as the second provider. It runs only when every Gemini key and model has failed,
 * so plans and answers stay AI-written through Gemini overloads. A global per-instance budget
 * keeps a burst of traffic from running up the bill, and every call ends inside the request
 * deadline.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import { abortAfter, raceAbort, untilAborted } from './abortable.js';
import { MIN_STAGE_MS, stageBudget, type Deadline } from './deadline.js';
import type { JsonResult } from './gemini.js';
import * as log from './log.js';
import { createRateLimiter } from './rateLimit.js';

/** Haiku keeps the fallback fast and cheap. */
export const CLAUDE_MODEL = 'claude-haiku-5-5';

/**
 * Longest one Claude call may take. A full plan from Haiku lands well inside 30 s; the request
 * deadline shortens this when Gemini has already used most of the time.
 */
export const CLAUDE_TIMEOUT_MS = 30_000;

/**
 * The SDK never retries. A retry would start a second full-length call the request deadline
 * cannot pay for; if Claude fails, the rules engine answers at once instead.
 */
const CLAUDE_MAX_RETRIES = 0;

/** At most 20 Claude calls per minute per instance, whatever the traffic, to cap spend. */
const CLAUDE_CALLS_PER_MINUTE = 20;

/** Room for a full plan (about 1,200 tokens in practice) with headroom. */
const PLAN_MAX_TOKENS = 4_096;

/** A chat answer is asked to stay under 180 words; this leaves room for a longer one on request. */
const CHAT_MAX_TOKENS = 2_000;

const CUT_SHORT = '\n\n_The answer was cut short. Please ask again._';

/** Minimal surface we use, so tests can pass a fake client. */
export interface ClaudeLike {
  messages: {
    create: Anthropic['messages']['create'];
    stream: Anthropic['messages']['stream'];
  };
}

let cached: ClaudeLike | null | undefined;
const budget = createRateLimiter({ limit: CLAUDE_CALLS_PER_MINUTE, windowMs: 60_000 });

/** The Claude client, or null when ANTHROPIC_API_KEY is unset. */
export function getClaude(): ClaudeLike | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  cached = apiKey
    ? new Anthropic({ apiKey, maxRetries: CLAUDE_MAX_RETRIES, timeout: CLAUDE_TIMEOUT_MS })
    : null;
  return cached;
}

/** Test hook. */
export function setClaude(client: ClaudeLike | null | undefined): void {
  cached = client;
  budget.reset();
}

/** A copy of any JSON Schema node with every object schema inside it closed. */
function closeNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeNode);
  if (!node || typeof node !== 'object') return node;
  return strictSchema(node);
}

/** Structured outputs need closed objects: add `additionalProperties: false` everywhere. */
export function strictSchema(schema: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = closeNode(v);
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

function withinBudget(): boolean {
  const ok = budget.check('claude').ok;
  if (!ok) log.warn('Claude fallback budget reached for this minute');
  return ok;
}

/** The client when a call may start now: configured, with time to answer and budget left. */
function readyClient(client: ClaudeLike | null | undefined, timeoutMs: number): ClaudeLike | null {
  const resolved = client === undefined ? getClaude() : client;
  if (!resolved || timeoutMs < MIN_STAGE_MS || !withinBudget()) return null;
  return resolved;
}

/** The validated answer in a finished message, or null when it cannot be trusted. */
function readAnswer<T>(res: Anthropic.Message, validate: ZodType<T>): JsonResult<T> | null {
  if (res.stop_reason === 'refusal') return null;
  if (res.stop_reason === 'max_tokens') {
    // The JSON stops mid-way; even if it happened to parse, part of the plan would be missing.
    log.warn('Claude ran out of tokens before the plan was complete');
    return null;
  }
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = validate.safeParse(JSON.parse(text));
  if (!parsed.success) {
    log.warn('Claude returned JSON that failed validation');
    return null;
  }
  return { data: parsed.data, model: CLAUDE_MODEL };
}

/**
 * Asks Haiku for JSON that matches `jsonSchema` and passes `validate`. Returns null on a refusal,
 * a truncated or invalid answer, an API error, an exhausted budget or too little time left, so
 * the caller falls back to the engine.
 */
export async function claudeJson<T>(opts: {
  system: string;
  prompt: string;
  jsonSchema: object;
  validate: ZodType<T>;
  client?: ClaudeLike | null;
  /** The request's deadline. Claude gets its own budget or the time left, whichever is smaller. */
  deadline?: Deadline;
}): Promise<JsonResult<T> | null> {
  const timeout = stageBudget(opts.deadline, CLAUDE_TIMEOUT_MS);
  const client = readyClient(opts.client, timeout);
  if (!client) return null;
  const limit = abortAfter(timeout, 'Claude timeout');
  try {
    const call = client.messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: PLAN_MAX_TOKENS,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: strictSchema(opts.jsonSchema) },
        },
      },
      { signal: limit.signal, timeout },
    );
    return readAnswer(await raceAbort(call, limit.signal), opts.validate);
  } catch (err) {
    reportFailure(err);
    return null;
  } finally {
    limit.done();
  }
}

/** Logs a failed JSON call by kind; SDK errors are reduced to their status code. */
function reportFailure(err: unknown): void {
  if (err instanceof Anthropic.RateLimitError) log.warn('Claude rate limited');
  else if (err instanceof Anthropic.APIError) log.warn(`Claude API error ${err.status}`);
  else log.warn('Claude call failed:', log.errorMessage(err, 160));
}

/** One chat message in Anthropic's role naming. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** What a chat stream needs: the conversation, and the limits it must end within. */
export interface ClaudeStreamOptions {
  system: string;
  messages: ChatTurn[];
  client?: ClaudeLike | null;
  /** The request's deadline. Claude gets its own budget or the time left, whichever is smaller. */
  deadline?: Deadline;
  /** Aborts when the reader has gone away, so the upstream call stops too. */
  signal?: AbortSignal;
}

/**
 * Streams Claude's answer as text deltas. Yields nothing if Claude is unavailable, over budget or
 * out of time. Returns whether any text was sent; a stream that breaks midway ends with a short
 * note, unless it broke because the reader left.
 */
export async function* claudeStream(opts: ClaudeStreamOptions): AsyncGenerator<string, boolean> {
  const timeout = stageBudget(opts.deadline, CLAUDE_TIMEOUT_MS);
  const gone = () => opts.signal?.aborted === true;
  const client = gone() ? null : readyClient(opts.client, timeout);
  if (!client) return false;
  let started = false;
  const limit = abortAfter(timeout, 'Claude timeout', opts.signal);
  try {
    const stream = client.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        system: opts.system,
        messages: opts.messages,
        output_config: { effort: 'low' },
      },
      { signal: limit.signal, timeout },
    );
    for await (const event of untilAborted(stream, limit.signal)) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        started = true;
        yield event.delta.text;
      }
    }
    return started;
  } catch (err) {
    if (gone()) return started;
    log.warn(
      'Claude stream failed:',
      err instanceof Anthropic.APIError ? `status ${err.status}` : log.errorMessage(err, 80),
    );
    if (started) yield CUT_SHORT;
    return started;
  } finally {
    limit.done();
  }
}
