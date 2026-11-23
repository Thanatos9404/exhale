import type { ReactNode } from 'react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { ErrorCard, LoadingCard } from '@/components/states';
import { useAir } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { ChoiceDiff } from './impact/ChoiceDiff';
import { ImpactStats } from './impact/ImpactStats';
import { MemberUsage } from './impact/MemberUsage';
import { diffItems } from './impact/plans';
import { useChangeSwitches, useImpactPlans } from './impact/useImpactPlans';

/**
 * The impact of each choice, made explicit: usage-style meters, a diff of habit versus plan,
 * and toggles that recompute the whole day with the engine so people can see what each
 * change is worth on its own and combined.
 */
export default function Impact() {
  const { household } = useAppState();
  const air = useAir();
  const { off, setApplied, applyAll } = useChangeSwitches();
  const { full, selected } = useImpactPlans(household, air.data, off);

  if (air.isError)
    return (
      <Shell>
        <ErrorCard
          message={air.error instanceof Error ? air.error.message : 'Unknown error'}
          onRetry={() => void air.refetch()}
        />
      </Shell>
    );
  if (!full || !selected)
    return (
      <Shell>
        <LoadingCard className="h-[420px]" />
      </Shell>
    );

  return (
    <Shell>
      <ImpactStats totals={selected.totals} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ChoiceDiff items={diffItems(full)} off={off} onToggle={setApplied} onApplyAll={applyAll} />
        <MemberUsage plan={selected} />
      </div>
    </Shell>
  );
}

interface ShellProps {
  children: ReactNode;
}

function Shell({ children }: ShellProps) {
  return (
    <>
      <PageHeader
        title="Impact"
        description="Exactly what each choice changes: particles not inhaled, cigarette-equivalents avoided and carbon not emitted."
      />
      <PageBody>{children}</PageBody>
    </>
  );
}
