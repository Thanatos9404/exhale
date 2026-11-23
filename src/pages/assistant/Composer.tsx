import type { KeyboardEvent, SubmitEvent } from 'react';
import { ArrowUp, Globe, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/primitives';
import { MAX_CHARS } from './chat';

/** The character counter appears once the draft passes this share of the limit. */
const COUNTER_FROM = 0.8;

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  search: boolean;
  onSearchChange: (on: boolean) => void;
  /** True while an answer is streaming: the send button becomes Stop. */
  busy: boolean;
  onSend: () => void;
  onStop: () => void;
}

/** The question box: Enter sends, Shift+Enter adds a line, with the web-search toggle and Stop. */
export function Composer({
  draft,
  onDraftChange,
  search,
  onSearchChange,
  busy,
  onSend,
  onStop,
}: ComposerProps) {
  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSend();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-line p-3 md:p-4">
      <div className="rounded-xl border border-line-strong bg-surface transition-[border-color,box-shadow] focus-within:border-fg focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--focus)_30%,transparent)]">
        <label htmlFor="ask" className="sr-only">
          Ask Exhale
        </label>
        <textarea
          id="ask"
          rows={2}
          maxLength={MAX_CHARS}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKey}
          placeholder="When should we open the windows today?"
          className="block max-h-40 min-h-[56px] w-full resize-y bg-transparent px-3 pt-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <div className="flex items-center gap-3 px-2 pb-2">
          <div className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted">
            <Switch
              id="web-search"
              checked={search}
              onChange={onSearchChange}
              label="Search the web for current advisories"
            />
            <label htmlFor="web-search" className="inline-flex cursor-pointer items-center gap-1.5">
              <Globe size={13} aria-hidden="true" /> Web search
            </label>
          </div>
          <span className="tabular ml-auto text-xs text-subtle">
            {draft.length > MAX_CHARS * COUNTER_FROM ? `${draft.length}/${MAX_CHARS}` : ''}
          </span>
          {busy ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onStop}
              leading={<Square size={12} aria-hidden="true" />}
            >
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send question"
              className="size-8 rounded-full px-0"
            >
              <ArrowUp size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 px-1 text-[11px] text-subtle">
        General guidance, not medical advice. For trouble breathing, seek care now.
      </p>
    </form>
  );
}
