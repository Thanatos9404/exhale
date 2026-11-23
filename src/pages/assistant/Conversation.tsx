import { useEffect, useRef, type ReactNode } from 'react';
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, streaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6" role="log" aria-label="Conversation">
      {messages.length === 0 && streaming === null ? (
        empty
      ) : (
        <ol className="mx-auto flex max-w-[720px] flex-col gap-6">
          {messages.map((m, i) => (
            <Message key={i} message={m} />
          ))}
          {streaming !== null && <Message message={{ role: 'model', text: streaming }} streaming />}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  );
}
