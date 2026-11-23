import { useMemo, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Avatar, Card, CardFooter, CardHeader, Switch } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ErrorCard, LoadingCard } from '@/components/states';
import { useAir } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { useCommandMenu } from '@/components/shell/CommandMenu';
import { buildPlan, type PlanResult, type RoutineItem } from '@/lib/planner/engine';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * The impact of each choice, made explicit: usage-style meters, a diff of habit versus plan,
 * and toggles that recompute the whole day with the engine so people can see what each
 * change is worth on its own and combined.
 */
export default function Impact() {
  const { household } = useAppState();
  const air = useAir();
  const [off, setOff] = useState<Set<string>>(new Set());

  const full = useMemo(() => (air.data ? buildPlan(household, air.data) : null), [air.data, household]);
  const selected = useMemo(() => {
    if (!air.data || !full) return null;
    const only = new Set(full.items.filter((i) => i.freeAction && !off.has(i.id)).map((i) => i.id));
    return buildPlan(household, air.data, new Date(), { only });
  }, [air.data, full, household, off]);

  if (air.isError) return <Shell><ErrorCard message={air.error instanceof Error ? air.error.message : 'Unknown error'} onRetry={() => void air.refetch()} /></Shell>;
  if (!full || !selected) return <Shell><LoadingCard className="h-[420px]" /></Shell>;

  const t = selected.totals;
  const saved = t.baselineDoseUg - t.optimizedDoseUg;
  const free = full.items.filter((i) => i.freeAction && i.change);
  const toggle = (id: string, on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Shell>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Dose avoided today" value={fmtDose(saved)} sub={`of ${fmtDose(t.baselineDoseUg)} as usual`} />
        <Stat label="Exposure cut" value={`${fmtDec(t.exposureCutPct, 0)}%`} sub="household, next 24 h" tone="green" />
        <Stat label="Cigarettes avoided" value={fmtCig(t.cigarettesAvoided)} sub="Berkeley Earth equivalence" />
        <Stat label="CO₂e saved" value={`${fmtDec(t.co2SavedKgWeek, 1)} kg`} sub={`a week · ${fmtDec(t.co2SavedKgDay, 2)} kg a day`} tone="blue" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Choice diff" description="Your usual day in red, the plan in green. Switch a change off to see what it is worth." />
          <ul className="border-t border-line">
            {free.map((item) => (
              <DiffHunk key={item.id} item={item} on={!off.has(item.id)} onToggle={(on) => toggle(item.id, on)} />
            ))}
          </ul>
          <CardFooter>
            <span>
              {free.length - off.size} of {free.length} changes applied
            </span>
            <Button size="sm" variant="tertiary" onClick={() => setOff(new Set())} disabled={off.size === 0}>
              Apply all
            </Button>
          </CardFooter>
        </Card>
        <MemberUsage plan={selected} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Impact" description="Exactly what each choice changes: particles not inhaled, cigarette-equivalents avoided and carbon not emitted." />
      <PageBody>{children}</PageBody>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'green' | 'blue' }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={cn('tabular mt-2 text-[28px] leading-none font-semibold tracking-[-0.035em]', tone === 'green' ? 'text-green' : tone === 'blue' ? 'text-blue' : 'text-fg')} aria-live="polite">
        {value}
      </div>
      <div className="mt-2 text-xs text-subtle">{sub}</div>
    </Card>
  );
}

function DiffHunk({ item, on, onToggle }: { item: RoutineItem; on: boolean; onToggle: (on: boolean) => void }) {
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
      <div className={cn('mx-5 mb-3 overflow-hidden rounded-md border border-line font-mono text-[12.5px] transition-opacity duration-200', !on && 'opacity-45')}>
        <div className="flex gap-3 bg-[var(--diff-del)] px-3 py-1.5 text-fg">
          <span aria-hidden="true" className="text-red select-none">−</span>
          <span className="sr-only">Usual: </span>
          <span className="min-w-0">{item.change!.before}</span>
        </div>
        <div className="flex gap-3 bg-[var(--diff-add)] px-3 py-1.5 text-fg">
          <span aria-hidden="true" className="text-green select-none">+</span>
          <span className="sr-only">Plan: </span>
          <span className="min-w-0">{item.change!.after}</span>
        </div>
        <div className="tabular flex flex-wrap gap-x-4 gap-y-1 border-t border-line bg-surface-2 px-3 py-1.5 font-sans text-xs text-muted">
          <span>−{fmtDose(item.impact.doseSavedUg)} inhaled</span>
          <span>{fmtDec(item.impact.exposureCutPct, 1)}% of their day</span>
          {item.impact.cigarettesAvoided > 0.004 && <span>−{fmtCig(item.impact.cigarettesAvoided)} cigarettes</span>}
          {item.impact.co2SavedKg > 0 && <span className="text-blue">−{fmtDec(item.impact.co2SavedKg, 2)} kg CO₂e a day</span>}
        </div>
      </div>
    </li>
  );
}

function MemberUsage({ plan }: { plan: PlanResult }) {
  const { household } = useAppState();
  return (
    <Card>
      <CardHeader title="Per person" description="Inhaled PM2.5 today against the WHO-guideline budget for their own schedule." />
      <ul className="border-t border-line">
        {plan.members.map((m) => {
          const pct = (m.optimizedDoseUg / Math.max(1, m.budgetUg)) * 100;
          const member = household.members.find((x) => x.id === m.id);
          return (
            <li key={m.id} className="border-b border-line px-5 py-4 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                  <Avatar name={m.name} size={20} />
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="text-xs text-subtle">
                  {member?.ageGroup}
                  {member?.conditions.length ? ` · ${member.conditions.join(', ')}` : ''}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <UsageRing pct={pct} />
                <dl className="tabular grid flex-1 grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-subtle">As usual</dt>
                  <dd className="text-right text-muted">{fmtDose(m.baselineDoseUg)}</dd>
                  <dt className="text-subtle">With plan</dt>
                  <dd className="text-right font-medium text-fg">{fmtDose(m.optimizedDoseUg)}</dd>
                  <dt className="text-subtle">Cigarettes</dt>
                  <dd className="text-right text-fg">
                    {fmtCig(m.baselineCigarettes)} → {fmtCig(m.optimizedCigarettes)}
                  </dd>
                  <dt className="text-subtle">Outdoor limit</dt>
                  <dd className="text-right text-fg">{fmtDec(m.pm25Limit, 0)} µg/m³</dd>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Usage ring: full circle = WHO budget; beyond 100% the ring turns red and shows the multiple. */
function UsageRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const over = pct > 100;
  const shown = Math.min(100, pct);
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`${Math.round(pct)}% of daily WHO budget`}>
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--hover)" strokeWidth="6" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke={over ? 'var(--red)' : 'var(--green)'}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * c} ${c}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="30" textAnchor="middle" dy="0.35em" fontSize="11" fontWeight="600" fill="var(--fg)" className="tabular">
        {over ? `${fmtDec(pct / 100, 1)}×` : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}
