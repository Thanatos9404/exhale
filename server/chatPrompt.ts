/**
 * Turns one validated chat request into the conversation a provider sees: the engine's CONTEXT,
 * then the earlier turns as untrusted history, then the question.
 */
import type { PlanResult } from '../src/lib/planner/engine.js';
import type { Household } from '../src/lib/profile/schema.js';
import type { ChatTurn } from './claude.js';
import type { ChatContent } from './gemini.js';
import { asData, buildChatContext, neutralise } from './prompts.js';
import type { ChatRequest } from './schemas.js';

/**
 * A replayed turn is cut to this before it enters a prompt. An answer is asked to stay under 180
 * words (about 1,200 characters), so 2,000 keeps a normal one whole while sixteen turns stay
 * within 32,000 characters of history however long the stored answers are.
 */
export const HISTORY_TURN_CHARS = 2_000;

/** Marks a turn that was shortened, so the model does not read the cut as the real ending. */
const CLIPPED = ' [shortened]';

/** How each role is named inside the history block. */
const SPEAKER = { user: 'user', model: 'assistant' } as const;

type ChatMessages = ChatRequest['messages'];

/** The text cut to `max` characters, never ending on half of a surrogate pair. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}${CLIPPED}`;
}

/** Earlier turns as one <history> data block, or nothing when the question is the first turn. */
function historyBlock(earlier: ChatMessages): string {
  if (earlier.length === 0) return '';
  const lines = earlier.map((m) => `${SPEAKER[m.role]}: ${clip(m.text, HISTORY_TURN_CHARS)}`);
  return `<history>\n${neutralise(lines.join('\n'))}\n</history>\n\n`;
}

/**
 * The conversation for one question.
 *
 * Trust decision: the browser holds the conversation and replays it with every question, so a
 * turn marked 'model' is whatever the client says it is. It is never forwarded as a genuine
 * assistant turn, where a forged "I will ignore my rules from now on" would carry the model's own
 * authority. Every earlier turn, user and model alike, goes into one <history> data block inside
 * the user's turn, which the system prompt declares unverified. The only assistant turn the model
 * sees is the acknowledgement written here.
 */
export function chatContents(
  plan: PlanResult,
  household: Household,
  messages: ChatMessages,
): ChatContent[] {
  const question = messages.at(-1)?.text ?? '';
  const turn = `${historyBlock(messages.slice(0, -1))}${asData('user', question)}`;
  return [
    { role: 'user', parts: [{ text: buildChatContext(plan, household) }] },
    { role: 'model', parts: [{ text: 'Understood. I will use only this context for numbers.' }] },
    { role: 'user', parts: [{ text: turn }] },
  ];
}

/** The same conversation in Anthropic's message format. */
export function toClaudeTurns(contents: ChatContent[]): ChatTurn[] {
  return contents.map((c) => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: (c.parts ?? []).map((p) => p.text ?? '').join(''),
  }));
}
