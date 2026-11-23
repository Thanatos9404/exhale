import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bike,
  Check,
  ChevronRight,
  Fan,
  Flame,
  House,
  ShieldAlert,
  Sparkles,
  Wind,
  Wrench,
} from 'lucide-react';
import type { RoutineItem, RoutineKind, RoutineStatus } from '@/lib/planner/engine';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Avatar, Dot } from './ui/primitives';
import type { Member } from '@/lib/profile/schema';

/** Routine items rendered like deployment rows: status, time, what to do, who, and impact. */

export const STATUS_META: Record<RoutineStatus, { label: string; dot: string }> = {
  go: { label: 'Do it', dot: 'bg-green' },
  caution: { label: 'Worth it', dot: 'bg-amber' },
  avoid: { label: 'Avoid', dot: 'bg-red' },
};

export const KIND_ICON: Record<RoutineKind, typeof Wind> = {
  ventilate: Wind,
  exercise: Bike,
  commute: Sparkles,
  protect: ShieldAlert,
  home: House,
  upgrade: Wrench,
};

export function StatusLabel({ status }: { status: RoutineStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-fg">
      <Dot className={m.dot} />
      {m.label}
    </span>
  );
}

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

export function RoutineRow({
  item,
  members,
  why,
  whyBy = 'Gemini',
  done,
  onToggleDone,
  defaultOpen = false,
  compact = false,
}: {
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();
  const Icon =
    item.kind === 'home' && /cook|heater/i.test(item.title)
      ? Flame
      : item.kind === 'home' && /purifier/i.test(item.title)
        ? Fan
        : KIND_ICON[item.kind];
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
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex min-w-0 items-start gap-3 rounded-md text-left"
        >
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-muted">
            <Icon size={14} aria-hidden="true" />
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
        <div className="col-span-2 md:col-span-1">
          <ImpactChips item={item} />
        </div>
        {onToggleDone ? (
          <button
            type="button"
            onClick={onToggleDone}
            aria-pressed={done}
            aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
            className={cn(
              'press hidden size-7 place-items-center rounded-md border transition-colors md:grid',
              done
                ? 'border-transparent bg-green text-background'
                : 'border-line-strong text-subtle hover:bg-hover',
            )}
          >
            <Check size={14} aria-hidden="true" />
          </button>
        ) : (
          <span className="hidden md:block" />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
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
                    <dd className="font-medium text-fg">
                      {fmtDec(item.impact.exposureCutPct, 1)}%
                    </dd>
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
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
