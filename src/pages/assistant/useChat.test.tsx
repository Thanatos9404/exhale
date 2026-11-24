import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChatMessage } from '@/lib/apiTypes';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { KEYS } from '@/lib/storage';
import { makeSnapshot } from '@/test/fixtures';
import { chatRequestSchema } from '../../../server/schemas';
import { MAX_CHARS, MAX_MODEL_TURN_CHARS, contextMessages, parseChat } from './chat';
import { useChat } from './useChat';

const place = makeSnapshot().place;
const LONG_ANSWER = 'Open the windows after 1 pm. '.repeat(500).slice(0, 12_000);

/** The JSON bodies of every /api/chat request the hook has made, oldest first. */
const sent: unknown[] = [];
let answers: string[] = [];

beforeEach(() => {
  sent.length = 0;
  answers = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(typeof init?.body === 'string' ? init.body : 'null'));
      // Headers arrive with the first chunk; the source is one of gemini, claude or rules.
      return new Response(answers.shift() ?? 'Short answer.', {
        headers: { 'x-exhale-source': 'gemini' },
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('useChat request context', () => {
  it('sends a valid request after a 12,000-character answer, and keeps that answer whole', async () => {
    answers = [LONG_ANSWER, 'After 1 pm.'];
    const { result } = renderHook(() => useChat({ place, household: DEFAULT_HOUSEHOLD }));

    await act(() => result.current.send('When should we air the flat?'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    // On screen and in storage the long answer is complete.
    expect(result.current.messages.map((m) => m.text.length)).toEqual([28, 12_000]);
    const stored = parseChat(JSON.parse(localStorage.getItem(KEYS.chat) ?? 'null')) ?? [];
    expect(stored.map((m) => m.text.length)).toEqual([28, 12_000]);

    await act(() => result.current.send('And tomorrow?'));
    await waitFor(() => expect(result.current.messages).toHaveLength(4));

    // The follow-up passes the server's own validation (parse throws on an invalid body)...
    const followUp = chatRequestSchema.parse(sent[1]);
    expect(followUp.messages.map((turn) => turn.role)).toEqual(['user', 'model', 'user']);
    // ...because the body on the wire replays exactly the first 8,000 characters of the answer.
    const body = JSON.stringify(sent[1]);
    expect(body).toContain(JSON.stringify(LONG_ANSWER.slice(0, MAX_MODEL_TURN_CHARS)));
    expect(body).not.toContain(JSON.stringify(LONG_ANSWER.slice(0, MAX_MODEL_TURN_CHARS + 1)));
    // Clipping the request did not touch the conversation itself.
    expect(result.current.messages.map((m) => m.text.length)).toEqual([28, 12_000, 13, 11]);
  });

  it('clips each turn to the limit for its role and leaves shorter turns untouched', () => {
    const short: ChatMessage = { role: 'model', text: 'Short answer.' };
    const history: ChatMessage[] = [
      { role: 'user', text: 'q'.repeat(MAX_CHARS + 500) },
      { role: 'model', text: 'a'.repeat(MAX_MODEL_TURN_CHARS + 4000) },
      { role: 'user', text: 'And tomorrow?' },
      short,
    ];
    const context = contextMessages(history);
    expect(context.map((turn) => turn.text.length)).toEqual([
      MAX_CHARS,
      MAX_MODEL_TURN_CHARS,
      13,
      13,
    ]);
    expect(context[3]).toBe(short);
    expect(history[1]?.text).toHaveLength(MAX_MODEL_TURN_CHARS + 4000);
  });

  it('sends only the most recent turns', () => {
    const history: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      text: `turn ${i}`,
    }));
    const context = contextMessages(history);
    expect(context).toHaveLength(16);
    expect(context.at(-1)?.text).toBe('turn 39');
  });
});
