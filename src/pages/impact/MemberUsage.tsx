import { Avatar, Card, CardHeader } from '@/components/ui/primitives';
import { useAppState } from '@/state/AppState';
import type { MemberSummary, PlanResult } from '@/lib/planner/engine';
import type { Member } from '@/lib/profile/schema';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { budgetPercent } from './plans';
import { UsageRing } from './UsageRing';

interface MemberUsageProps {
  plan: PlanResult;
}

/** Per-person dose against each member's own WHO budget, as usage rings with the numbers. */
export function MemberUsage({ plan }: MemberUsageProps) {
  const { household } = useAppState();
  return (
    <Card>
      <CardHeader
        title="Per person"
        description="Inhaled PM2.5 today against the WHO-guideline budget for their own schedule."
      />
      <ul className="border-t border-line">
        {plan.members.map((m) => (
          <MemberRow key={m.id} summary={m} member={household.members.find((x) => x.id === m.id)} />
        ))}
      </ul>
    </Card>
  );
}

interface MemberRowProps {
  summary: MemberSummary;
  /** The household profile entry, if the member still exists. */
  member: Member | undefined;
}

function MemberRow({ summary: m, member }: MemberRowProps) {
  return (
    <li className="border-b border-line px-5 py-4 last:border-b-0">
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
        <UsageRing pct={budgetPercent(m)} />
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
}
