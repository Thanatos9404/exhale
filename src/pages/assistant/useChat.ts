import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { streamChat } from '@/lib/api';
import type { ChatMessage } from '@/lib/apiTypes';
import type { Place } from '@/lib/air/types';
import type { Household } from '@/lib/profile/schema';
import { KEYS, readStored, removeStored, writeStored } from '@/lib/storage';
import {
  CONTEXT_MESSAGES,
  EMPTY_ANSWER,
  MAX_CHARS,
  STORED_MESSAGES,
  isAbortError,
  parseChat,
} from './chat';

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
  draft: string;
  setDraft: (text: string) => void;
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

/** Conversation state for the assistant: history, draft, streaming answer and its controls. */
export function useChat({ place, household }: ChatContext): Chat {
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => readStored(KEYS.chat, parseChat) ?? [],
  );
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string, useSearch = search) => {
      const q = text.trim().slice(0, MAX_CHARS);
      if (!q || streaming !== null) return;
      const history: ChatMessage[] = [...messages, { role: 'user', text: q }];
      setMessages(history);
      setDraft('');
      setStreaming('');
      setAnnounce('Exhale is answering');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { text: answer } = await streamChat(
          { place, household, messages: history.slice(-CONTEXT_MESSAGES), search: useSearch },
          (soFar) => setStreaming(soFar),
          ctrl.signal,
        );
        const next: ChatMessage[] = [...history, { role: 'model', text: answer || EMPTY_ANSWER }];
        setMessages(next);
        writeStored(KEYS.chat, next.slice(-STORED_MESSAGES));
        setAnnounce('Answer ready');
      } catch (err) {
        if (isAbortError(err)) {
          setAnnounce('Stopped');
        } else {
          toast.error(err instanceof Error ? err.message : 'The assistant is unavailable');
          setMessages(messages);
          setDraft(q);
        }
      } finally {
        setStreaming(null);
        abortRef.current = null;
      }
    },
    [messages, streaming, place, household, search],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    setMessages([]);
    removeStored(KEYS.chat);
  }, []);

  return {
    messages,
    streaming,
    announce,
    draft,
    setDraft,
    search,
    setSearch,
    send,
    stop,
    clear,
  };
}
