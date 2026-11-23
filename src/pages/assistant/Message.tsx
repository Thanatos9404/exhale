import { lazy, Suspense } from 'react';
import type { Components } from 'react-markdown';
import { ParticleOrb } from '@/components/ParticleOrb';
import type { ChatMessage } from '@/lib/apiTypes';

const Markdown = lazy(() => import('react-markdown'));

/** Links in answers open in a new tab without handing over the opener. */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

interface MessageProps {
  message: ChatMessage;
  /** True for the answer that is still arriving. */
  streaming?: boolean;
}

/** One chat bubble: plain text for the user, rendered Markdown for Exhale's answers. */
export function Message({ message, streaming = false }: MessageProps) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-hover px-4 py-2.5 text-sm whitespace-pre-wrap text-fg">
          {message.text}
        </div>
      </li>
    );
  }
  return (
    <li className="flex gap-3" aria-busy={streaming || undefined}>
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-fg">
        <ParticleOrb size={18} active={streaming} />
      </span>
      <div className="prose-exhale min-w-0 flex-1 text-fg">
        {message.text ? (
          <Suspense fallback={<p className="whitespace-pre-wrap">{message.text}</p>}>
            <Markdown skipHtml components={MARKDOWN_COMPONENTS}>
              {message.text}
            </Markdown>
          </Suspense>
        ) : (
          <p className="text-muted">Thinking with your live data…</p>
        )}
        {streaming && message.text && (
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-[exhale-caret_1s_steps(1)_infinite] bg-fg"
          />
        )}
      </div>
    </li>
  );
}
