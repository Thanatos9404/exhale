/**
 * The scrolling conversation log. Finished messages keep their identity while an answer streams,
 * so only the bubble that is still arriving re-renders.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ChatMessage } from '@/lib/apiTypes';
import { Message } from './Message';

interface ConversationProps {
  messages: ChatMessage[];
  /** Text of the answer streamed so far; null when nothing is in flight. */
  streaming: string | null;
  /** Shown instead of the log before the first question. */
  empty: ReactNode;
}

/** The scrolling conversation log; keeps the newest message in view as answers stream in. */
export function Conversation({ messages, streaming, empty }: ConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const isStreaming = streaming !== null;
  const arriving = useMemo<ChatMessage | null>(
    () => (streaming === null ? null : { role: 'model', text: streaming }),
    [streaming],
  );
  // The arriving answer sits at the index its finished message will take, so the bubble (and its
  // orb) carries over when the stream ends instead of being rebuilt.
  const shown = arriving ? [...messages, arriving] : messages;

  // A new message, or an answer starting or ending, glides into view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  // Streamed text follows instantly: a smooth scroll restarted per chunk never catches up.
  useEffect(() => {
    if (streaming) endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }, [streaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6" role="log" aria-label="Conversation">
      {shown.length === 0 ? (
        empty
      ) : (
        <ol className="mx-auto flex max-w-[720px] flex-col gap-6">
          {shown.map((m, i) => (
            <Message key={i} message={m} streaming={m === arriving} />
          ))}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  );
}
