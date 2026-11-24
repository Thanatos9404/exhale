/**
 * One routine action as an expandable row, styled like an entry in a deployment list. This file
 * owns the open state and the column grid; the parts it lays out are in ./RoutineRowParts and
 * ./routineMeta.
 */
import { useState } from 'react';
import type { RoutineItem } from '@/lib/planner/engine';
import type { Member } from '@/lib/profile/schema';
import { cn } from '@/lib/cn';
import { ImpactChips, StatusLabel } from './routineMeta';
import { DoneToggle, RowDetails, RowPanel, RowPeople, RowToggle } from './RoutineRowParts';

export interface RoutineRowProps {
  item: RoutineItem;
  members: Member[];
  why?: string | undefined;
  /** Which model wrote the why. */
  whyBy?: string;
  done?: boolean;
  onToggleDone?: (() => void) | undefined;
  defaultOpen?: boolean;
  /** Narrow cards: drop the people column and give the action more room. */
  compact?: boolean;
}

/** One routine action as an expandable deployment-style row. */
export function RoutineRow({
  item,
  members,
  why,
  whyBy = 'Gemini',
  done = false,
  onToggleDone,
  defaultOpen = false,
  compact = false,
}: RoutineRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const who = members.filter((m) => item.memberIds.includes(m.id));
  const panelId = `row-${item.id}`;

  return (
    <li className="border-b border-line last:border-b-0">
      <div
        className={cn(
          'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 md:px-5',
          compact
            ? 'md:grid-cols-[96px_48px_minmax(0,1fr)_116px_32px]'
            : 'md:grid-cols-[120px_64px_minmax(0,1fr)_auto_150px_36px]',
        )}
      >
        <div className="hidden md:block">
          <StatusLabel status={item.status} />
        </div>
        <div className="tabular hidden text-[13px] text-muted md:block">
          {item.time ?? 'Any time'}
        </div>
        <RowToggle
          item={item}
          open={open}
          done={done}
          panelId={panelId}
          onToggle={() => setOpen((o) => !o)}
        />
        <RowPeople who={who} compact={compact} />
        <div className="col-span-2 md:col-span-1">
          <ImpactChips item={item} />
        </div>
        {onToggleDone ? (
          <DoneToggle title={item.title} done={done} onToggle={onToggleDone} />
        ) : (
          <span className="hidden md:block" />
        )}
      </div>
      <RowPanel open={open} panelId={panelId}>
        <RowDetails item={item} why={why} whyBy={whyBy} done={done} onToggleDone={onToggleDone} />
      </RowPanel>
    </li>
  );
}
