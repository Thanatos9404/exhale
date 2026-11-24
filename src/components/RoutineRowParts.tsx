/**
 * The pieces of one routine row: its expand button, people, done tick, the collapsible panel
 * and the details shown inside it.
 */
import type { ReactNode } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import type { RoutineItem } from '@/lib/planner/engine';
import type { Member } from '@/lib/profile/schema';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Avatar, Dot } from './ui/primitives';
import { RoutineIcon, STATUS_META } from './routineMeta';
import { useCollapse } from './useCollapse';

interface RowToggleProps {
  item: RoutineItem;
  open: boolean;
  done: boolean;
  panelId: string;
  onToggle: () => void;
}

/** The row's main button: icon, title and (on phones) status and time. It expands the panel. */
export function RowToggle({ item, open, done, panelId, onToggle }: RowToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className="group flex min-w-0 items-start gap-3 rounded-md text-left"
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-muted">
        <RoutineIcon item={item} />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm font-medium text-fg group-hover:underline group-hover:underline-offset-4',
            done && 'text-muted line-through',
          )}
        >
          {item.title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-subtle md:hidden">
          <Dot className={STATUS_META[item.status].dot} /> {STATUS_META[item.status].label} ·{' '}
          {item.time ?? 'Any time'}
        </span>
      </span>
      <ChevronRight
        size={14}
        aria-hidden="true"
        className={cn(
          'mt-1 ml-auto shrink-0 text-subtle transition-transform duration-200',
          open && 'rotate-90',
        )}
      />
    </button>
  );
}

/** Avatars of the people an action is for. Hidden on narrow cards and phones. */
export function RowPeople({ who, compact }: { who: Member[]; compact: boolean }) {
  return (
    <div
      className={cn('hidden -space-x-1', !compact && 'md:flex')}
      aria-label={`For ${who.map((w) => w.name).join(', ')}`}
    >
      {who.slice(0, 4).map((m) => (
        <span key={m.id} title={m.name}>
          <Avatar name={m.name} size={20} />
        </span>
      ))}
    </div>
  );
}

/** The square tick button that marks an action done. */
export function DoneToggle({
  title,
  done,
  onToggle,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={done ? `Mark "${title}" not done` : `Mark "${title}" done`}
      className={cn(
        'press hidden size-8 place-items-center rounded-md border transition-colors md:grid',
        done
          ? 'border-transparent bg-green text-background'
          : 'border-field-border text-subtle hover:bg-hover',
      )}
    >
      <Check size={14} aria-hidden="true" />
    </button>
  );
}

/** The collapsible region under a row. It animates height unless motion is reduced. */
export function RowPanel({
  open,
  panelId,
  children,
}: {
  open: boolean;
  panelId: string;
  children: ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const { ref, rendered } = useCollapse<HTMLDivElement>(open, reduced);
  if (!rendered) return null;
  return (
    <div ref={ref} id={panelId} className="overflow-hidden">
      {children}
    </div>
  );
}

interface RowDetailsProps {
  item: RoutineItem;
  why?: string | undefined;
  whyBy: string;
  done: boolean;
  onToggleDone?: (() => void) | undefined;
}

/** The expanded panel: the model's explanation for this family and the engine's working. */
export function RowDetails({ item, why, whyBy, done, onToggleDone }: RowDetailsProps) {
  return (
    <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 md:pl-[204px] md:pr-5">
      {why && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-blue">
            <Sparkles size={12} aria-hidden="true" /> Why, for your family ({whyBy})
          </div>
          <p className="text-[13px] text-fg">{why}</p>
        </div>
      )}
      <div className="rounded-lg border border-line p-3">
        <div className="mb-1 text-xs font-medium text-muted">How we worked it out</div>
        <p className="text-[13px] text-fg">{item.detail}</p>
        <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-subtle">Dose saved</dt>
            <dd className="font-medium text-fg">{fmtDose(item.impact.doseSavedUg)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Of their day</dt>
            <dd className="font-medium text-fg">{fmtDec(item.impact.exposureCutPct, 1)}%</dd>
          </div>
          <div>
            <dt className="text-subtle">Cigarettes</dt>
            <dd className="font-medium text-fg">{fmtCig(item.impact.cigarettesAvoided)}</dd>
          </div>
        </dl>
        {onToggleDone && (
          <button
            type="button"
            onClick={onToggleDone}
            aria-pressed={done}
            className="mt-3 text-xs font-medium text-blue hover:underline md:hidden"
          >
            {done ? 'Mark not done' : 'Mark done'}
          </button>
        )}
      </div>
    </div>
  );
}
