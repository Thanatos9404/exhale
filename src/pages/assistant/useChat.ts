/**
 * Conversation state for the assistant: the history, the answer being streamed (applied once
 * per animation frame) and the controls. The draft is not here; the composer owns it. Answers
 * come from the server, or from the hybrid Firebase model when private answers are on.
 */
import { useCallback, useRef, useState } from 'react';
import { notify } from '@/components/shell/toasts';
import type { ChatMessage } from '@/lib/apiTypes';
import type { Place } from '@/lib/air/types';
import type { Household } from '@/lib/profile/schema';
import { KEYS, readStored, removeStored, writeStored } from '@/lib/storage';
import { MAX_CHARS, STORED_MESSAGES, isAbortError, parseChat, type DraftReset } from './chat';
import { answerQuestion, readyText, replyFrom, type PrivateRoute } from './answer';
import { frameBatch } from './frameBatch';

/** What every question is sent with. */
export interface ChatContext {
  place: Place;
  household: Household;
}

/** Conversation state and actions returned by `useChat`. */
export interface Chat {
  messages: ChatMessage[];
  /** Text of the answer streamed so far; null when nothing is in flight. */
  streaming: string | null;
  /** Status text for the polite live region. */
  announce: string;
  /** What the composer's draft should become: empty after a send, the question after a failure. */
  draftReset: DraftReset;
  /** Whether questions use web search. */
  search: boolean;
  setSearch: (on: boolean) => void;
  /** Sends a question and streams the answer; ignored while another answer is streaming. */
  send: (text: string, useSearch?: boolean) => Promise<void>;
  /** Aborts the answer in flight. */
  stop: () => void;
  /** Empties the conversation here and in storage. */
  clear: () => void;
}

/**
 * Conversation state for the assistant: history, streaming answer and its controls. With a
 * private route, questions go to the hybrid Firebase model instead of the server.
 */
export function useChat(
  { place, household }: ChatContext,
  route: PrivateRoute | null = null,
): Chat {
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => readStored(KEYS.chat, parseChat) ?? [],
  );
  const [draftReset, setDraftReset] = useState<DraftReset>({ id: 0, text: '' });
  const [search, setSearch] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string, useSearch = search) => {
      const q = text.trim().slice(0, MAX_CHARS);
      if (!q || streaming !== null) return;
      const resetDraft = (next: string) => setDraftReset((r) => ({ id: r.id + 1, text: next }));
      const history: ChatMessage[] = [...messages, { role: 'user', text: q }];
      setMessages(history);
      resetDraft('');
      setStreaming('');
      setAnnounce('Exhale is answering');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // Chunks can arrive many times a frame; only the latest text is worth rendering.
      const chunks = frameBatch<string>(setStreaming);
      try {
        const question = { text: q, history, place, household, search: useSearch };
        const answer = await answerQuestion(question, route, chunks.push, ctrl.signal);
        const next: ChatMessage[] = [...history, replyFrom(answer)];
        setMessages(next);
        writeStored(KEYS.chat, next.slice(-STORED_MESSAGES));
        setAnnounce(readyText(answer.engine));
      } catch (err) {
        if (isAbortError(err)) {
          setAnnounce('Stopped');
        } else {
          notify.error(err instanceof Error ? err.message : 'The assistant is unavailable');
          setMessages(messages);
          resetDraft(q);
        }
      } finally {
        chunks.cancel();
        setStreaming(null);
        abortRef.current = null;
      }
    },
    [messages, streaming, place, household, search, route],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    setMessages([]);
    removeStored(KEYS.chat);
  }, []);

  return { messages, streaming, announce, draftReset, search, setSearch, send, stop, clear };
}
