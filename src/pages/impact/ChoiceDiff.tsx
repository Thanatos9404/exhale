/**
 * The habit-versus-plan diff on the Impact page, laid out like a code review: one hunk per
 * change, each with a switch to leave it out. The page owns the switches and recomputes the day
 * from them.
 */
import { MessageSquareText } from 'lucide-react';
import { Card, CardFooter, CardHeader, Switch } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useCommandMenu } from '@/components/shell/CommandMenu';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { DiffItem } from './plans';

/** Smaller cigarette savings round to zero, so they are not listed. */
const MIN_CIGARETTES = 0.004;

interface ChoiceDiffProps {
  items: readonly DiffItem[];
  off: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onApplyAll: () => void;
}

/** Habit versus plan as a code-review style diff, with a switch per change. */
export function ChoiceDiff({ items, off, onToggle, onApplyAll }: ChoiceDiffProps) {
  return (
    <Card>
      <CardHeader
        title="Choice diff"
        description="Your usual day in red, the plan in green. Switch a change off to see what it is worth."
      />
      <ul className="border-t border-line">
        {items.map((item) => (
          <DiffHunk
            key={item.id}
            item={item}
            on={!off.has(item.id)}
            onToggle={(on) => onToggle(item.id, on)}
          />
        ))}
      </ul>
      <CardFooter>
        <span>
          {items.length - off.size} of {items.length} changes applied
        </span>
        <Button size="sm" variant="tertiary" onClick={onApplyAll} disabled={off.size === 0}>
          Apply all
        </Button>
      </CardFooter>
    </Card>
  );
}

interface DiffHunkProps {
  item: DiffItem;
  on: boolean;
  onToggle: (on: boolean) => void;
}

function DiffHunk({ item, on, onToggle }: DiffHunkProps) {
  const { open } = useCommandMenu();
  const id = `diff-${item.id}`;
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 px-5 py-3">
        <Switch id={id} checked={on} onChange={onToggle} label={`Apply: ${item.title}`} />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm font-medium text-fg">
          {item.title}
        </label>
        <button
          type="button"
          onClick={() => open(`Explain the impact of: ${item.title}`)}
          className="hidden shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-fg sm:inline-flex"
          aria-label={`Ask Exhale about: ${item.title}`}
        >
          <MessageSquareText size={13} aria-hidden="true" /> Ask
        </button>
      </div>
      <div
        className={cn(
          'mx-5 mb-3 overflow-hidden rounded-md border border-line font-mono text-[12.5px] transition-opacity duration-200',
          !on && 'opacity-45',
        )}
      >
        <div className="flex gap-3 bg-[var(--diff-del)] px-3 py-1.5 text-fg">
          <span aria-hidden="true" className="text-red select-none">
            −
          </span>
          <span className="sr-only">Usual: </span>
          <span className="min-w-0">{item.change.before}</span>
        </div>
        <div className="flex gap-3 bg-[var(--diff-add)] px-3 py-1.5 text-fg">
          <span aria-hidden="true" className="text-green select-none">
            +
          </span>
          <span className="sr-only">Plan: </span>
          <span className="min-w-0">{item.change.after}</span>
        </div>
        <div className="tabular flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface-2 px-3 py-1.5 font-sans text-xs text-muted">
          <span>−{fmtDose(item.impact.doseSavedUg)} inhaled</span>
          <span>{fmtDec(item.impact.exposureCutPct, 1)}% of their day</span>
          {item.impact.cigarettesAvoided > MIN_CIGARETTES && (
            <span>−{fmtCig(item.impact.cigarettesAvoided)} cigarettes</span>
          )}
          {item.impact.co2SavedKg > 0 && (
            <span className="text-blue">−{fmtDec(item.impact.co2SavedKg, 2)} kg CO₂e a day</span>
          )}
        </div>
      </div>
    </li>
  );
}
