import type { Content, GenerateContentResponse } from '@google/genai';
import * as log from '../log.js';
import { breaker, slotId } from './breaker.js';
import { candidates, slotsFor, type Candidate, type GenAiLike } from './candidates.js';
import {
  FIRST_TOKEN_TIMEOUT_MS,
  OVERALL_DEADLINE_MS,
  STREAM_HARD_STOP_MS,
  STREAM_MIN_TIME_LEFT_MS,
  STREAM_SWEEPS,
  STREAM_SWEEP_PAUSE_MS,
  THINKING,
} from './config.js';
import { isRetryable } from './errors.js';

export interface StreamOptions {
  system: string;
  contents: Content[];
  /** Ground the answer in Google Search and append the cited sources. */
  search?: boolean;
  /** Omit to use the configured keys; pass a client (tests) or null (no Gemini). */
  client?: GenAiLike | null;
}

/** The model that finished the answer. */
export interface StreamResult {
  model: string;
}

/** How one attempt ended: an answer or a final failure, or 'next' to try the next pair. */
type AttemptOutcome = StreamResult | null | 'next';

/** Only the first few cited pages are listed, so sources never crowd out the answer. */
const MAX_SOURCES = 5;
const CUT_SHORT = '\n\n_The answer was cut short. Please ask again._';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Adds the web pages Google Search grounding cites in this chunk, keyed by URL. */
function collectSources(chunk: GenerateContentResponse, into: Map<string, string>): void {
  for (const g of chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (g.web?.uri) into.set(g.web.uri, g.web.title ?? g.web.uri);
  }
}

/** A Markdown "Sources" list of the first cited pages, with brackets stripped from titles. */
export function formatSources(sources: ReadonlyMap<string, string>): string {
  const links = [...sources.entries()]
    .slice(0, MAX_SOURCES)
    .map(([uri, title]) => `- [${title.replace(/[[\]]/g, '')}](${uri})`)
    .join('\n');
  return `\n\n**Sources**\n${links}`;
}

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

/**
 * Streams one pair's answer. Before the first chunk, a retryable failure benches the pair and
 * returns 'next'. After it, any failure ends the answer with a short note instead.
 */
async function* streamFrom(
  c: Candidate,
  opts: StreamOptions,
): AsyncGenerator<string, AttemptOutcome> {
  let started = false;
  const ctrl = new AbortController();
  // Time-to-first-token budget; cleared once text starts flowing.
  const firstTokenTimer = setTimeout(
    () => ctrl.abort(new Error('timeout waiting for first token')),
    FIRST_TOKEN_TIMEOUT_MS,
  );
  const hardStop = setTimeout(() => ctrl.abort(new Error('deadline')), STREAM_HARD_STOP_MS);
  try {
    const stream = await startStream(c, opts, ctrl.signal);
    const sources = new Map<string, string>();
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        clearTimeout(firstTokenTimer);
        started = true;
        yield text;
      }
      collectSources(chunk, sources);
    }
    if (sources.size > 0) yield formatSources(sources);
    return { model: c.model };
  } catch (err) {
    if (started || !isRetryable(err)) {
      log.warn(`stream ${slotId(c)} failed:`, log.errorMessage(err, 200));
      if (started) yield CUT_SHORT;
      return null;
    }
    // A search-quota error says nothing about the pair's health for plain requests.
    const searchQuota = opts.search && /429|quota/i.test(log.errorMessage(err, 400));
    if (!searchQuota) breaker.trip(c, err);
    return 'next';
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(hardStop);
  }
}

/**
 * Streams text chunks. Falls through to the next candidate only before the first chunk arrives,
 * so a user never sees two half-answers stitched together. Appends web sources when
 * Google Search grounding is on. Returns the model that answered, or null when none did.
 */
export async function* streamText(
  opts: StreamOptions,
): AsyncGenerator<string, StreamResult | null> {
  const slots = slotsFor(opts.client);
  if (slots.length === 0) return null;
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  const list = candidates(slots);
  const attempts = Array.from({ length: STREAM_SWEEPS }, () => list).flat();
  for (const [i, c] of attempts.entries()) {
    if (deadline - Date.now() < STREAM_MIN_TIME_LEFT_MS) break;
    if (breaker.outOfQuota(c)) continue;
    if (i > 0 && i % list.length === 0) await sleep(STREAM_SWEEP_PAUSE_MS);
    const outcome = yield* streamFrom(c, opts);
    if (outcome !== 'next') return outcome;
  }
  return null;
}
