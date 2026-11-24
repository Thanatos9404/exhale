/**
 * The provider chain for one chat answer. The first provider that writes anything wins: Gemini
 * (with search, then without), then Claude Haiku, then the offline engine, so the user always
 * gets an answer, and every chunk says which provider wrote it.
 */
import type { PlanResult } from '../src/lib/planner/engine.js';
import { toClaudeTurns } from './chatPrompt.js';
import { claudeStream, getClaude } from './claude.js';
import type { Deadline } from './deadline.js';
import { fallbackAnswer } from './fallback.js';
import { getClient, streamText, type ChatContent } from './gemini.js';
import { CHAT_SYSTEM } from './prompts.js';

/** Who wrote an answer; sent to the browser in the x-exhale-source header. */
export type ChatSource = 'gemini' | 'claude' | 'rules';

/** A piece of the answer and the provider that wrote it. */
export interface ChatChunk {
  source: ChatSource;
  text: string;
}

/** Everything the chain needs for one question. */
export interface ChatAnswerInput {
  contents: ChatContent[];
  search: boolean;
  question: string;
  plan: PlanResult;
  /** The request's deadline; every provider gets its own budget or the time left. */
  deadline: Deadline;
  /** Aborts when the reader has gone away, so no further provider is called. */
  signal: AbortSignal;
}

const SEARCH_UNAVAILABLE =
  '_Web search is unavailable right now, so this answer uses your live data only._\n\n';

/**
 * Relays a provider's text as chunks labelled with its name. `lead` goes in front of the first
 * chunk only, so a notice is never sent before some provider has started to answer. Returns
 * whether anything was sent.
 */
async function* relay(
  source: ChatSource,
  text: AsyncIterable<string>,
  lead: string,
): AsyncGenerator<ChatChunk, boolean> {
  let sent = false;
  for await (const piece of text) {
    yield { source, text: sent ? piece : lead + piece };
    sent = true;
  }
  return sent;
}

/**
 * Streams the answer to one question. Always yields at least one chunk unless the reader left:
 * when no provider answers in time, the offline engine does, from the plan alone.
 */
export async function* answerChat(a: ChatAnswerInput): AsyncGenerator<ChatChunk, void> {
  const shared = { system: CHAT_SYSTEM, deadline: a.deadline, signal: a.signal };
  const gemini = (search: boolean, lead: string) =>
    relay('gemini', streamText({ ...shared, contents: a.contents, search }), lead);
  const useGemini = getClient() !== null;
  let lead = '';
  if (useGemini && a.search) {
    if (yield* gemini(true, lead)) return;
    // Grounding can be unavailable (quota or region); answer from live data instead of failing.
    lead = SEARCH_UNAVAILABLE;
  }
  if (useGemini && (yield* gemini(false, lead))) return;
  // Gemini exhausted its keys, models, time or budget: Claude Haiku answers from the same context.
  const claude = claudeStream({ ...shared, messages: toClaudeTurns(a.contents) });
  if (yield* relay('claude', claude, lead)) return;
  if (a.signal.aborted) return;
  const aiConfigured = useGemini || getClaude() !== null;
  yield { source: 'rules', text: lead + fallbackAnswer(a.question, a.plan, aiConfigured) };
}
