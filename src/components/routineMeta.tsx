/**
 * The shared look of a routine action: its status label, the icon for its kind and the chips
 * for what it saves. Kept apart from the row so every part of a row presents an action the
 * same way.
 */
import { Bike, Fan, Flame, House, ShieldAlert, Sparkles, Wind, Wrench } from 'lucide-react';
import type { RoutineItem, RoutineKind, RoutineStatus } from '@/lib/planner/engine';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Dot } from './ui/primitives';

/** Label and dot colour for each routine status, as in a deployment list. */
export const STATUS_META: Record<RoutineStatus, { label: string; dot: string }> = {
  go: { label: 'Do it', dot: 'bg-green' },
  caution: { label: 'Worth it', dot: 'bg-amber' },
  avoid: { label: 'Avoid', dot: 'bg-red' },
};

/** The default icon for each kind of routine action. */
export const KIND_ICON: Record<RoutineKind, typeof Wind> = {
  ventilate: Wind,
  exercise: Bike,
  commute: Sparkles,
  protect: ShieldAlert,
  home: House,
  upgrade: Wrench,
};

/** Coloured status dot with its label, as in a deployment list. */
export function StatusLabel({ status }: { status: RoutineStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-fg">
      <Dot className={m.dot} />
      {m.label}
    </span>
  );
}

/** The measurable wins of one action: dose not inhaled, cigarettes avoided and CO2e saved. */
export function ImpactChips({ item, compact = false }: { item: RoutineItem; compact?: boolean }) {
  const { impact } = item;
  const chips: { text: string; tone: string; title: string }[] = [];
  if (impact.doseSavedUg > 0)
    chips.push({
      text: `−${fmtDose(impact.doseSavedUg)}`,
      tone: 'text-green',
      title: 'Particulate not inhaled today',
    });
  if (!compact && impact.cigarettesAvoided > 0.004)
    chips.push({
      text: `−${fmtCig(impact.cigarettesAvoided)} cig`,
      tone: 'text-muted',
      title: 'Cigarette-equivalents avoided (Berkeley Earth)',
    });
  if (impact.co2SavedKg > 0)
    chips.push({
      text: `−${fmtDec(impact.co2SavedKg, 1)} kg CO₂e`,
      tone: 'text-blue',
      title: 'CO2e saved per day',
    });
  if (chips.length === 0) return <span className="text-xs text-subtle">Protective</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {chips.map((c) => (
        <span
          key={c.text}
          title={c.title}
          className={cn('tabular text-xs font-medium whitespace-nowrap', c.tone)}
        >
          {c.text}
        </span>
      ))}
    </span>
  );
}

/** Home actions get a more specific icon than their kind when the title names the source. */
export function RoutineIcon({ item }: { item: RoutineItem }) {
  if (item.kind === 'home' && /cook|heater/i.test(item.title)) {
    return <Flame size={14} aria-hidden="true" />;
  }
  if (item.kind === 'home' && /purifier/i.test(item.title)) {
    return <Fan size={14} aria-hidden="true" />;
  }
  const Icon = KIND_ICON[item.kind];
  return <Icon size={14} aria-hidden="true" />;
}
