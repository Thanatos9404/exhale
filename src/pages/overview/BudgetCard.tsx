import { Avatar, Card, CardFooter, CardHeader } from '@/components/ui/primitives';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import type { MemberSummary, PlanResult } from '@/lib/planner/engine';

/** A member's dose as a multiple of their WHO-guideline budget. */
function budgetRatio(doseUg: number, budgetUg: number): number {
  return doseUg / Math.max(1, budgetUg);
}

/** Percentage of the bar's full scale, for inline widths and offsets. */
const pct = (ratio: number, scale: number) => `${(ratio / scale) * 100}%`;

interface BudgetCardProps {
  members: MemberSummary[];
  totals: Pick<PlanResult['totals'], 'exposureCutPct' | 'cigarettesAvoided'>;
}

/** Each person's inhaled PM2.5 today, before and after the plan, against their WHO budget. */
export function BudgetCard({ members, totals }: BudgetCardProps) {
  const scale = Math.max(1, ...members.map((m) => budgetRatio(m.baselineDoseUg, m.budgetUg)));
  return (
    <Card>
      <CardHeader
        title="Exposure budget"
        description="Today’s inhaled PM2.5 against breathing WHO-guideline air on the same schedule."
      />
      <ul className="space-y-5 px-5 pb-5">
        {members.map((m) => (
          <MemberBudget key={m.id} member={m} scale={scale} />
        ))}
      </ul>
      <CardFooter>
        <span>
          Plan cuts household dose by{' '}
          <strong className="font-semibold text-fg">{Math.round(totals.exposureCutPct)}%</strong>
        </span>
        <span className="tabular">−{fmtCig(totals.cigarettesAvoided)} cigarettes</span>
      </CardFooter>
    </Card>
  );
}

interface MemberBudgetProps {
  member: MemberSummary;
  /** Largest ratio in the household, so every bar shares one scale. */
  scale: number;
}

/** One person's budget bar: usual dose, planned dose and the WHO line. */
function MemberBudget({ member, scale }: MemberBudgetProps) {
  const before = budgetRatio(member.baselineDoseUg, member.budgetUg);
  const after = budgetRatio(member.optimizedDoseUg, member.budgetUg);
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-fg">
          <Avatar name={member.name} size={18} />
          <span className="truncate">{member.name}</span>
        </span>
        <span className="tabular text-xs text-muted">
          {fmtDec(before, 1)}× →{' '}
          <strong className="font-semibold text-fg">{fmtDec(after, 1)}×</strong>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-red/45"
          style={{ width: pct(before, scale) }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-fg"
          style={{ width: pct(after, scale) }}
        />
        <div className="absolute inset-y-0 w-px bg-green" style={{ left: pct(1, scale) }} />
      </div>
      <p className="sr-only">
        {member.name}: {fmtDec(before, 1)} times the WHO budget as usual, {fmtDec(after, 1)} times
        with the plan.
      </p>
      <div className="tabular mt-1.5 flex justify-between text-xs text-subtle">
        <span>
          {fmtDose(member.optimizedDoseUg)} of {fmtDose(member.budgetUg)} budget
        </span>
        <span>{fmtCig(member.optimizedCigarettes)} cig</span>
      </div>
    </li>
  );
}
