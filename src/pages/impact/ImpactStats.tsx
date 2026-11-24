/**
 * Headline numbers of the Impact page for the changes currently switched on: dose, exposure,
 * cigarette equivalents and CO2e.
 */
import { Card } from '@/components/ui/primitives';
import type { PlanResult } from '@/lib/planner/engine';
import { fmtCig, fmtDec, fmtDose } from '@/lib/format';
import { cn } from '@/lib/cn';

type Tone = 'green' | 'blue';

const TONE_CLASS: Record<Tone, string> = { green: 'text-green', blue: 'text-blue' };

interface ImpactStatsProps {
  totals: PlanResult['totals'];
}

/** The four headline numbers for the selected plan: dose, exposure, cigarettes and CO2e. */
export function ImpactStats({ totals: t }: ImpactStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat
        label="Dose avoided today"
        value={fmtDose(t.baselineDoseUg - t.optimizedDoseUg)}
        sub={`of ${fmtDose(t.baselineDoseUg)} as usual`}
      />
      <Stat
        label="Exposure cut"
        value={`${fmtDec(t.exposureCutPct, 0)}%`}
        sub="household, next 24 h"
        tone="green"
      />
      <Stat
        label="Cigarettes avoided"
        value={fmtCig(t.cigarettesAvoided)}
        sub="Berkeley Earth equivalence"
      />
      <Stat
        label="CO₂e saved"
        value={`${fmtDec(t.co2SavedKgWeek, 1)} kg`}
        sub={`a week · ${fmtDec(t.co2SavedKgDay, 2)} kg a day`}
        tone="blue"
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  sub: string;
  tone?: Tone;
}

function Stat({ label, value, sub, tone }: StatProps) {
  return (
    <Card className="p-5">
      <div className="text-[13px] text-muted">{label}</div>
      <div
        className={cn(
          'tabular mt-2 text-[28px] leading-none font-semibold tracking-[-0.035em]',
          tone ? TONE_CLASS[tone] : 'text-fg',
        )}
        aria-live="polite"
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-subtle">{sub}</div>
    </Card>
  );
}
