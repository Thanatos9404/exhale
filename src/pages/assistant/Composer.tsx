/**
 * The question box. It owns the draft, so typing re-renders the composer alone and never the
 * conversation above it. When Firebase is configured it also carries the private-answers switch;
 * private answers cannot search the web, so the web-search switch steps aside while it is on.
 */
import { useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { ArrowUp, Globe, Square } from 'lucide-react';
import { PRIVACY_NOTE, PrivateAiToggle } from '@/components/PrivateAi';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/primitives';
import { MAX_CHARS, type DraftReset } from './chat';

/** The character counter appears once the draft passes this share of the limit. */
const COUNTER_FROM = 0.8;

interface ComposerProps {
  /** Replaces the draft whenever its id changes: emptied after a send, restored after a failure. */
  reset: DraftReset;
  search: boolean;
  onSearchChange: (on: boolean) => void;
  /** True while an answer is streaming: the send button becomes Stop. */
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** The private-answers switch; absent when Firebase is not configured. */
  privateMode?: { enabled: boolean; onChange: (on: boolean) => void } | undefined;
}

const PRIVATE_NOTE_ID = 'private-ask-note';

/** The web-search switch with its visible label. */
function SearchToggle({ search, onChange }: { search: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted">
      <Switch
        id="web-search"
        checked={search}
        onChange={onChange}
        label="Search the web for current advisories"
      />
      <label htmlFor="web-search" className="inline-flex cursor-pointer items-center gap-1.5">
        <Globe size={13} aria-hidden="true" /> Web search
      </label>
    </div>
  );
}

/** The private-answers switch when Firebase is configured, and web search unless it is on. */
function Switches({
  search,
  onSearchChange,
  privateMode,
}: Pick<ComposerProps, 'search' | 'onSearchChange' | 'privateMode'>) {
  return (
    <>
      {privateMode && (
        <PrivateAiToggle
          compact
          id="private-ask"
          noteId={PRIVATE_NOTE_ID}
          label="Answer on this device (Gemini Nano)"
          checked={privateMode.enabled}
          onChange={privateMode.onChange}
        />
      )}
      {!privateMode?.enabled && <SearchToggle search={search} onChange={onSearchChange} />}
    </>
  );
}

/** Stop while an answer streams; otherwise the round send button, disabled for an empty draft. */
function SendOrStop({
  busy,
  empty,
  onStop,
}: {
  busy: boolean;
  empty: boolean;
  onStop: () => void;
}) {
  if (busy) {
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={onStop}
        leading={<Square size={12} aria-hidden="true" />}
      >
        Stop
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="primary"
      type="submit"
      disabled={empty}
      aria-label="Send question"
      className="size-8 rounded-full px-0"
    >
      <ArrowUp size={16} aria-hidden="true" />
    </Button>
  );
}

/** The draft text, replaced from outside whenever a new reset arrives. */
function useDraft(reset: DraftReset) {
  const [draft, setDraft] = useState(reset.text);
  const [applied, setApplied] = useState(reset.id);
  if (applied !== reset.id) {
    setApplied(reset.id);
    setDraft(reset.text);
  }
  return [draft, setDraft] as const;
}

/** The question box: Enter sends, Shift+Enter adds a line, with the web-search toggle and Stop. */
export function Composer({
  reset,
  search,
  onSearchChange,
  busy,
  onSend,
  onStop,
  privateMode,
}: ComposerProps) {
  const [draft, setDraft] = useDraft(reset);
  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSend(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend(draft);
    }
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-line p-3 md:p-4">
      <div className="rounded-xl border border-field-border bg-surface transition-[border-color] focus-within:border-fg has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-focus">
        <label htmlFor="ask" className="sr-only">
          Ask Exhale
        </label>
        <textarea
          id="ask"
          rows={2}
          maxLength={MAX_CHARS}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="When should we open the windows today?"
          className="block max-h-40 min-h-[56px] w-full resize-y bg-transparent px-3 pt-3 text-sm text-fg outline-none placeholder:text-subtle"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-2">
          <Switches search={search} onSearchChange={onSearchChange} privateMode={privateMode} />
          <span className="tabular ml-auto text-xs text-subtle">
            {draft.length > MAX_CHARS * COUNTER_FROM ? `${draft.length}/${MAX_CHARS}` : ''}
          </span>
          <SendOrStop busy={busy} empty={!draft.trim()} onStop={onStop} />
        </div>
      </div>
      {privateMode && (
        <p id={PRIVATE_NOTE_ID} className="mt-2 px-1 text-[11px] text-subtle">
          {PRIVACY_NOTE}
        </p>
      )}
      <p className="mt-2 px-1 text-[11px] text-subtle">
        General guidance, not medical advice. For trouble breathing, seek care now.
      </p>
    </form>
  );
}
