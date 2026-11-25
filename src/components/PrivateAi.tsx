/**
 * The two pieces of UI for private on-device answers that the Routine page and the Assistant
 * share: the labelled switch with its privacy note, and the badge that says which engine wrote an
 * answer (Gemini Nano on this device, or cloud Gemini through Firebase).
 */
import { Cloud, Cpu } from 'lucide-react';
import type { AiEngine } from '@/lib/apiTypes';
import { cn } from '@/lib/cn';
import { Badge, Switch } from './ui/primitives';

/** The one-line privacy note under the switch. */
export const PRIVACY_NOTE =
  'Health details stay in this browser when Gemini Nano answers. Where it is unavailable, Firebase answers with cloud Gemini and the badge says Cloud.';

/** Badge text for each engine. */
export const ENGINE_LABEL: Record<AiEngine, string> = {
  'on-device': 'On-device',
  cloud: 'Cloud (Firebase)',
};

interface PrivateAiToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  /** Small text beside the composer's other switches; the note is then rendered elsewhere. */
  compact?: boolean;
  /** Id of the privacy note when the caller renders it (compact layout). */
  noteId?: string;
}

/** The private-answers switch with a visible label and, unless compact, its privacy note. */
export function PrivateAiToggle({
  id,
  label,
  checked,
  onChange,
  compact = false,
  noteId = `${id}-note`,
}: PrivateAiToggleProps) {
  return (
    <div className={cn('flex items-start gap-3', compact && 'items-center gap-2 px-1.5 py-1')}>
      <Switch id={id} checked={checked} onChange={onChange} label={label} describedBy={noteId} />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5',
            compact ? 'text-xs text-muted' : 'text-sm font-medium text-fg',
          )}
        >
          <Cpu size={compact ? 13 : 14} aria-hidden="true" /> {label}
        </label>
        {!compact && (
          <p id={noteId} className="mt-1 max-w-[70ch] text-xs text-muted">
            {PRIVACY_NOTE}
          </p>
        )}
      </div>
    </div>
  );
}

/** Which engine wrote an answer: green for on-device, blue for the cloud fallback. */
export function EngineBadge({ engine }: { engine: AiEngine }) {
  const Icon = engine === 'on-device' ? Cpu : Cloud;
  return (
    <Badge tone={engine === 'on-device' ? 'green' : 'blue'}>
      <Icon size={11} aria-hidden="true" />
      <span className="sr-only">Answered: </span>
      {ENGINE_LABEL[engine]}
    </Badge>
  );
}
