import { useMemo, useState } from 'react';
import { ErrorCard, LoadingCard } from '@/components/states';
import { useAqiSeries, useLocalPlan } from '@/hooks/useAir';
import { hasWebGL } from '@/hooks/useThemeColors';
import { useAppState } from '@/state/AppState';
import { AirNowCard } from './overview/AirNowCard';
import { BudgetCard } from './overview/BudgetCard';
import { OverviewActions, OverviewLayout } from './overview/OverviewLayout';
import { scrubHour } from './overview/scrub';
import { TodayRoutineCard } from './overview/TodayRoutineCard';

/** Overview page: the air right now, the next hours, today's routine and each person's budget. */
export default function Overview() {
  const { household } = useAppState();
  const { plan, data: air, isLoading, isError, error, refetch } = useLocalPlan();
  const aqi = useAqiSeries();
  const [offset, setOffset] = useState(0);
  const webgl = useMemo(() => hasWebGL(), []);

  if (isError)
    return (
      <OverviewLayout>
        <ErrorCard
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      </OverviewLayout>
    );

  const scrub = air && aqi ? scrubHour(air, aqi, offset, household.standard) : null;
  if (isLoading || !air || !plan || !scrub)
    return (
      <OverviewLayout>
        <LoadingCard className="h-[420px]" />
      </OverviewLayout>
    );

  return (
    <OverviewLayout description={plan.headline} actions={<OverviewActions />}>
      <AirNowCard
        air={air}
        plan={plan}
        scrub={scrub}
        standard={household.standard}
        webgl={webgl}
        onScrub={setOffset}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <TodayRoutineCard plan={plan} />
        <BudgetCard members={plan.members} totals={plan.totals} />
      </div>
    </OverviewLayout>
  );
}
