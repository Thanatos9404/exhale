/** The forecast page: the metric tabs and their chart, the cleanest hours and what drives the smog. */
import { useState, type ReactNode } from 'react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Card } from '@/components/ui/primitives';
import { ErrorCard, LoadingCard } from '@/components/states';
import { useAqiSeries, useLocalPlan } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { ChartPanel } from './forecast/ChartPanel';
import { CleanestHours } from './forecast/CleanestHours';
import { ForecastControls } from './forecast/ForecastControls';
import { METRIC_PANEL_ID, MetricTabs } from './forecast/MetricTabs';
import { PollutantMix } from './forecast/PollutantMix';
import { SmogLidCard } from './forecast/SmogLidCard';
import { upcomingHours } from './forecast/series';
import { useChartView } from './forecast/useChartView';
import type { ForecastRange, Metric } from './forecast/metrics';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

/** The forecast page: per-metric chart with smog-lid bands, pollutant mix and cleanest hours. */
export default function Forecast() {
  const { household, setHousehold } = useAppState();
  const { data: air, plan, isLoading, isError, error, refetch } = useLocalPlan();
  const aqi = useAqiSeries();
  const [metric, setMetric] = useState<Metric>('aqi');
  const [range, setRange] = useState<ForecastRange>('48');
  const view = useChartView({
    air,
    instantAqi: aqi?.instant,
    metric,
    range,
    cleanStart: plan?.cleanWindow?.start,
  });

  if (isError)
    return (
      <Shell>
        <ErrorCard message={errorMessage(error)} onRetry={() => void refetch()} />
      </Shell>
    );
  const now = air?.hourly[air.nowIndex];
  if (isLoading || !air || !aqi || !view || !plan || !now)
    return (
      <Shell>
        <LoadingCard className="h-[420px]" />
      </Shell>
    );
  const tabs = { metric, air, instantAqi: aqi.instant };

  return (
    <Shell
      actions={
        <ForecastControls
          standard={household.standard}
          onStandardChange={(s) => setHousehold({ ...household, standard: s })}
          range={range}
          onRangeChange={setRange}
        />
      }
    >
      <Card>
        <MetricTabs {...tabs} onSelect={setMetric} panelId={METRIC_PANEL_ID} />
        <ChartPanel
          metric={metric}
          view={view}
          standard={household.standard}
          placeLabel={plan.placeLabel}
          range={range}
        />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PollutantMix now={now} />
        <CleanestHours upcoming={upcomingHours(air, 24)} />
        <SmogLidCard now={now} />
      </div>
    </Shell>
  );
}

interface ShellProps {
  children: ReactNode;
  actions?: ReactNode;
}

function Shell({ children, actions }: ShellProps) {
  return (
    <>
      <PageHeader
        title="Forecast"
        description="Past 12 hours and the days ahead, hour by hour, with the smog lid marked."
        actions={actions}
      />
      <PageBody>{children}</PageBody>
    </>
  );
}
