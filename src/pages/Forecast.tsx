import { lazy, Suspense, useMemo, useState } from 'react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Card, CardHeader, Segmented } from '@/components/ui/primitives';
import { ErrorCard, LoadingCard } from '@/components/states';
import { AreaChart, type Band, type ChartPoint, type Threshold } from '@/components/charts/AreaChart';
import { InversionDiagram } from '@/components/InversionDiagram';
import { useAqiSeries, useLocalPlan } from '@/hooks/useAir';
import { useCssVars, hasWebGL } from '@/hooks/useThemeColors';
import { useAppState } from '@/state/AppState';
import { POLLUTANT_LABEL } from '@/lib/air/aqi';
import type { AqiStandard, HourPoint, Pollutant } from '@/lib/air/types';
import { dispersionClass, isLidHour, ventilationCoefficient } from '@/lib/science/meteo';
import { fmtDec, fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

const ParticleDonut = lazy(() => import('@/components/three/ParticleDonut'));

type Metric = 'aqi' | Pollutant;

const METRICS: { key: Metric; label: string; unit: string }[] = [
  { key: 'aqi', label: 'AQI', unit: '' },
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³' },
  { key: 'pm10', label: 'PM10', unit: 'µg/m³' },
  { key: 'no2', label: 'NO₂', unit: 'µg/m³' },
  { key: 'o3', label: 'O₃', unit: 'µg/m³' },
];

/** WHO 2021 guideline levels (24 h for PM and NO2, 8 h for O3). */
const WHO: Record<Pollutant, number> = { pm25: 15, pm10: 45, no2: 25, o3: 100 };

const THRESHOLDS: Record<Metric, (s: AqiStandard) => Threshold[]> = {
  aqi: (s) => (s === 'in' ? [{ value: 100, label: 'Satisfactory limit' }, { value: 200, label: 'Moderate limit' }] : [{ value: 100, label: 'Moderate limit' }, { value: 150, label: 'Sensitive groups' }]),
  pm25: () => [{ value: 15, label: 'WHO 24 h' }, { value: 60, label: 'India 24 h standard' }],
  pm10: () => [{ value: 45, label: 'WHO 24 h' }, { value: 100, label: 'India 24 h standard' }],
  no2: () => [{ value: 25, label: 'WHO 24 h' }, { value: 80, label: 'India 24 h standard' }],
  o3: () => [{ value: 100, label: 'WHO 8 h' }],
};

export default function Forecast() {
  const { household, setHousehold } = useAppState();
  const { data: air, plan, isLoading, isError, error, refetch } = useLocalPlan();
  const aqi = useAqiSeries();
  const [metric, setMetric] = useState<Metric>('aqi');
  const [range, setRange] = useState<'24' | '48' | '72'>('48');
  const [hoverSeg, setHoverSeg] = useState(-1);
  const [table, setTable] = useState(false);
  const colors = useCssVars(['blue', 'amber', 'aqi-4', 'green'] as const);
  const webgl = useMemo(() => hasWebGL(), []);

  const view = useMemo(() => {
    if (!air || !aqi) return null;
    const from = Math.max(0, air.nowIndex - 12);
    const to = Math.min(air.hourly.length, air.nowIndex + Number(range));
    const hours = air.hourly.slice(from, to);
    const value = (h: HourPoint, i: number): number | null => (metric === 'aqi' ? aqi.instant[from + i]!.aqi : h[metric]);
    const points: ChartPoint[] = hours.map((h, i) => ({
      label: h.time.slice(11, 13) === '00' ? new Date(`${h.time}:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : h.time.slice(11, 16),
      value: value(h, i),
    }));
    const bands: Band[] = [];
    let start: number | null = null;
    hours.forEach((h, i) => {
      if (isLidHour(h) && start == null) start = i;
      if ((!isLidHour(h) || i === hours.length - 1) && start != null) {
        bands.push({ from: start, to: i, kind: 'lid' });
        start = null;
      }
    });
    if (plan?.cleanWindow) {
      const ci = hours.findIndex((h, i) => from + i >= air.nowIndex && h.time.slice(11, 16) === plan.cleanWindow!.start);
      if (ci >= 0) bands.push({ from: ci, to: ci + 1, kind: 'clean' });
    }
    return { from, points, bands, nowLocal: air.nowIndex - from };
  }, [air, aqi, metric, range, plan]);

  if (isError) return <Shell><ErrorCard message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} /></Shell>;
  if (isLoading || !air || !aqi || !view || !plan) return <Shell><LoadingCard className="h-[420px]" /></Shell>;

  const now = air.hourly[air.nowIndex]!;
  const dayAgo = air.hourly[Math.max(0, air.nowIndex - 24)]!;
  const kpi = (m: Metric) => {
    const cur = m === 'aqi' ? aqi.instant[air.nowIndex]!.aqi : (now[m] ?? 0);
    const prev = m === 'aqi' ? aqi.instant[Math.max(0, air.nowIndex - 24)]!.aqi : (dayAgo[m] ?? 0);
    const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
    return { cur, delta };
  };
  const active = METRICS.find((m) => m.key === metric)!;

  const segments = (['pm25', 'pm10', 'no2', 'o3'] as const).map((p, i) => ({
    key: p,
    ratio: (now[p] ?? 0) / WHO[p],
    color: [colors.blue, colors.amber, colors['aqi-4'], colors.green][i]!,
  }));
  const top = hoverSeg >= 0 ? segments[hoverSeg]! : segments.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const maxRatio = Math.max(...segments.map((s) => s.ratio), 1);

  const upcoming = air.hourly.slice(air.nowIndex, air.nowIndex + 24).map((h, i) => ({ h, i: air.nowIndex + i }));
  const cleanest = [...upcoming].filter((x) => x.h.pm25 != null).sort((a, b) => a.h.pm25! - b.h.pm25!).slice(0, 6);
  const worstPm = Math.max(...upcoming.map((x) => x.h.pm25 ?? 0), 1);
  const vc = ventilationCoefficient(now.blh, now.wind);

  return (
    <Shell
      actions={
        <>
          <Segmented<AqiStandard>
            label="AQI standard"
            value={household.standard}
            onChange={(s) => setHousehold({ ...household, standard: s })}
            options={[{ value: 'in', label: 'India NAQI' }, { value: 'us', label: 'US EPA' }]}
          />
          <Segmented<'24' | '48' | '72'>
            label="Forecast range"
            value={range}
            onChange={setRange}
            options={[{ value: '24', label: '24h' }, { value: '48', label: '48h' }, { value: '72', label: '72h' }]}
          />
        </>
      }
    >
      <Card>
        <div role="tablist" aria-label="Metric" className="grid grid-cols-2 border-b border-line sm:grid-cols-5">
          {METRICS.map((m) => {
            const k = kpi(m.key);
            const selected = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'relative flex flex-col items-start gap-1 border-line px-5 py-4 text-left transition-colors duration-150 [&:not(:last-child)]:border-r',
                  selected ? 'bg-surface' : 'bg-surface-2 hover:bg-hover',
                )}
              >
                <span className="text-[13px] text-muted">{m.label}{m.unit && <span className="text-subtle"> · {m.unit}</span>}</span>
                <span className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">{fmtInt(k.cur)}</span>
                <span className={cn('tabular text-xs font-medium', k.delta > 0 ? 'text-red' : 'text-green')}>
                  {k.delta > 0 ? '+' : ''}
                  {fmtDec(k.delta, 0)}% vs 24 h ago
                </span>
                {selected && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-fg" />}
              </button>
            );
          })}
        </div>
        <div role="tabpanel" aria-label={`${active.label} chart`} className="p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-blue" aria-hidden="true" /> {active.label}{metric === 'aqi' ? ' (hourly)' : ''}</span>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-4 bg-[repeating-linear-gradient(135deg,var(--amber)_0_2px,transparent_2px_5px)] opacity-60" /> Smog lid hours</span>
            <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-4 rounded-sm bg-green/25" /> Cleanest hour</span>
            <button type="button" onClick={() => setTable((t) => !t)} aria-expanded={table} className="ml-auto font-medium text-fg hover:underline">
              {table ? 'Hide data table' : 'Show data table'}
            </button>
          </div>
          <AreaChart
            data={view.points}
            nowIndex={view.nowLocal}
            bands={view.bands}
            thresholds={THRESHOLDS[metric](household.standard)}
            unit={active.unit || 'AQI'}
            ariaLabel={`${active.label} for ${plan.placeLabel}, past 12 hours and next ${range} hours`}
          />
          {table && (
            <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-line">
              <table className="tabular w-full text-left text-[13px]">
                <caption className="sr-only">{active.label} by hour</caption>
                <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Time</th>
                    <th scope="col" className="px-3 py-2 font-medium">{active.label}</th>
                    <th scope="col" className="px-3 py-2 font-medium">Mixing height</th>
                    <th scope="col" className="px-3 py-2 font-medium">Wind</th>
                  </tr>
                </thead>
                <tbody>
                  {air.hourly.slice(view.from, view.from + view.points.length).map((h, i) => (
                    <tr key={h.time} className="border-t border-line">
                      <td className="px-3 py-1.5">{h.time.replace('T', ' ')}</td>
                      <td className="px-3 py-1.5">{view.points[i]!.value == null ? 'n/a' : fmtInt(view.points[i]!.value!)}</td>
                      <td className="px-3 py-1.5">{h.blh == null ? 'n/a' : `${fmtInt(h.blh)} m`}</td>
                      <td className="px-3 py-1.5">{h.wind == null ? 'n/a' : `${fmtDec(h.wind, 1)} km/h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Pollutant mix" description="Each arc is how many times over its WHO guideline a pollutant is right now." />
          <div className="relative mx-5 aspect-square max-h-[260px] w-auto">
            {webgl ? (
              <Suspense fallback={null}>
                <ParticleDonut segments={segments.map((s) => ({ key: s.key, value: s.ratio, color: s.color }))} hover={hoverSeg} />
              </Suspense>
            ) : null}
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">{fmtDec(top.ratio, 1)}×</div>
                <div className="text-xs text-muted">{POLLUTANT_LABEL[top.key]} vs WHO</div>
              </div>
            </div>
          </div>
          <ul className="space-y-1 px-3 pb-4" onPointerLeave={() => setHoverSeg(-1)}>
            {segments.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onPointerEnter={() => setHoverSeg(i)}
                  onFocus={() => setHoverSeg(i)}
                  onBlur={() => setHoverSeg(-1)}
                  className="relative flex h-9 w-full items-center justify-between overflow-hidden rounded-md px-2 text-[13px] hover:bg-hover"
                  aria-label={`${POLLUTANT_LABEL[s.key]}: ${fmtInt(now[s.key] ?? 0)} micrograms per cubic metre, ${fmtDec(s.ratio, 1)} times the WHO guideline`}
                >
                  <span aria-hidden="true" className="absolute inset-y-1 left-1 rounded-[4px] opacity-15" style={{ width: `${(s.ratio / maxRatio) * 96}%`, background: s.color }} />
                  <span className="relative inline-flex items-center gap-2 font-medium text-fg">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: s.color }} />
                    {POLLUTANT_LABEL[s.key]}
                  </span>
                  <span className="tabular relative text-muted">
                    {fmtInt(now[s.key] ?? 0)} µg/m³ · {fmtDec(s.ratio, 1)}×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Cleanest hours ahead" description="Best times to air the house, exercise or run errands." />
          <ol className="space-y-1 px-3 pb-4">
            {cleanest.map(({ h }) => (
              <li key={h.time} className="relative flex h-9 items-center justify-between overflow-hidden rounded-md px-2 text-[13px]">
                <span aria-hidden="true" className="absolute inset-y-1 left-1 rounded-[4px] bg-green opacity-15" style={{ width: `${((h.pm25 ?? 0) / worstPm) * 96}%` }} />
                <span className="tabular relative font-medium text-fg">
                  {new Date(`${h.time}:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} {h.time.slice(11, 16)}
                </span>
                <span className="tabular relative text-muted">
                  {fmtInt(h.pm25 ?? 0)} µg/m³{isLidHour(h) ? ' · lid' : ''}
                </span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Why is it so smoggy?" description="Winter nights trap emissions under a lid of warm air." />
          <div className="px-5 pb-5">
            <InversionDiagram blh={now.blh ?? 800} wind={now.wind ?? 0} vc={vc} dispersion={dispersionClass(vc)} />
          </div>
        </Card>
      </div>
    </Shell>
  );
}

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Forecast" description="Past 12 hours and the days ahead, hour by hour, with the smog lid marked." actions={actions} />
      <PageBody>{children}</PageBody>
    </>
  );
}

