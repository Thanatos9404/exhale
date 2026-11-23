import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Rocket } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button, buttonStyles } from '@/components/ui/Button';
import {
  AqiStatus,
  Avatar,
  Badge,
  Card,
  CardFooter,
  CardHeader,
  Dot,
  aqiVar,
} from '@/components/ui/primitives';
import { ErrorCard, LoadingCard } from '@/components/states';
import { RoutineRow } from '@/components/routine';
import { useAqiSeries, useLocalPlan } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { useDeployments } from '@/state/Deployments';
import { aqiCategory, POLLUTANT_LABEL, type AqiLevel } from '@/lib/air/aqi';
import { WHO_PM25_24H, cigarettesPerDay } from '@/lib/science/exposure';
import {
  DISPERSION_LABEL,
  dispersionClass,
  isLidHour,
  ventilationCoefficient,
} from '@/lib/science/meteo';
import { dayHourLabel, fmtCig, fmtDec, fmtDose, fmtInt, relativeTime } from '@/lib/format';
import { hasWebGL } from '@/hooks/useThemeColors';
import { cn } from '@/lib/cn';
import type { MemberSummary } from '@/lib/planner/engine';

const AirColumn = lazy(() => import('@/components/three/AirColumn'));

const SCRUB_HOURS = 48;

export default function Overview() {
  const { household } = useAppState();
  const { plan, data: air, isLoading, isError, error, refetch } = useLocalPlan();
  const aqi = useAqiSeries();
  const { deploy, latest, done, toggleDone } = useDeployments();
  const [, navigate] = useLocation();
  const [offset, setOffset] = useState(0);
  const webgl = useMemo(() => hasWebGL(), []);

  if (isError)
    return (
      <Page>
        <ErrorCard
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      </Page>
    );
  if (isLoading || !air || !plan || !aqi)
    return (
      <Page>
        <LoadingCard className="h-[420px]" />
      </Page>
    );

  const maxOffset = Math.min(SCRUB_HOURS - 1, air.hourly.length - 1 - air.nowIndex);
  const idx = air.nowIndex + Math.min(offset, maxOffset);
  const h = air.hourly[idx]!;
  const instant = aqi.instant[idx]!;
  const official = aqi.official[air.nowIndex]!;
  const level = aqiCategory(instant.aqi, household.standard).level;
  const nowCat = aqiCategory(official.aqi, household.standard);
  const vc = ventilationCoefficient(h.blh, h.wind);
  const disp = dispersionClass(vc);
  const pm = h.pm25 ?? 0;
  const aiWhy = new Map(latest?.response.ai?.items.map((i) => [i.id, i.why]) ?? []);
  const label = offset === 0 ? 'Now' : dayHourLabel(h.time);

  return (
    <Page
      description={plan.headline}
      actions={
        <>
          <Link href="/forecast" className={buttonStyles()}>
            View forecast
          </Link>
          <Button
            variant="primary"
            leading={<Rocket size={15} aria-hidden="true" />}
            onClick={() => {
              navigate('/routine');
              void deploy();
            }}
          >
            Deploy today’s routine
          </Button>
        </>
      }
    >
      <Card>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Preview: the air column */}
          <div className="p-4 md:p-5">
            <div className="bg-grid relative aspect-[16/11] overflow-hidden rounded-lg border border-line bg-surface-2">
              {webgl ? (
                <Suspense
                  fallback={
                    <div className="absolute inset-0 grid place-items-center text-xs text-subtle">
                      Loading 3D air column…
                    </div>
                  }
                >
                  <AirColumn pm25={pm} blh={h.blh ?? 800} wind={h.wind ?? 5} level={level} />
                </Suspense>
              ) : (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-muted">
                  3D view needs WebGL. Mixing height {fmtInt(h.blh ?? 0)} m, PM2.5 {fmtInt(pm)}{' '}
                  µg/m³.
                </div>
              )}
              <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
                <Badge tone={offset === 0 ? 'green' : 'neutral'}>
                  {offset === 0 && <Dot className="bg-green" pulse />}
                  {label}
                </Badge>
                {isLidHour(h) && <Badge tone="amber">Smog lid {fmtInt(h.blh ?? 0)} m</Badge>}
              </div>
              <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-line bg-surface/80 px-2 py-1 text-[11px] text-muted backdrop-blur">
                Particles ∝ PM2.5 · lid = mixing height · drift = wind
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <label htmlFor="scrub" className="font-medium">
                  Scrub the next {maxOffset + 1} hours
                </label>
                <span className="tabular">
                  {label} · {fmtInt(pm)} µg/m³
                </span>
              </div>
              <input
                id="scrub"
                type="range"
                min={0}
                max={maxOffset}
                step={1}
                value={Math.min(offset, maxOffset)}
                onChange={(e) => setOffset(Number(e.target.value))}
                aria-valuetext={`${label}: PM2.5 ${fmtInt(pm)} micrograms per cubic metre, mixing height ${fmtInt(h.blh ?? 0)} metres`}
                className="w-full"
              />
              <HourStrip
                air={air}
                levels={aqi.instant.map((a) => aqiCategory(a.aqi, household.standard).level)}
                active={idx}
                onPick={(i) => setOffset(i - air.nowIndex)}
              />
            </div>
          </div>

          {/* Details */}
          <div className="border-t border-line p-5 lg:border-t-0 lg:border-l">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
              <div className="col-span-2">
                <dt className="text-[13px] text-muted">
                  Air quality index · {household.standard === 'in' ? 'India NAQI' : 'US EPA'}
                </dt>
                <dd className="mt-1 flex items-baseline gap-3">
                  <span
                    className="tabular text-[44px] leading-none font-semibold tracking-[-0.04em]"
                    style={{ color: aqiVar(nowCat.level) }}
                  >
                    {official.aqi}
                  </span>
                  <AqiStatus level={nowCat.level} label={nowCat.label} />
                </dd>
                <dd className="mt-2 text-[13px] text-muted">{nowCat.advice}</dd>
              </div>
              <Detail
                label="PM2.5 now"
                value={`${fmtInt(air.current.pm25 ?? 0)} µg/m³`}
                sub={`${fmtDec((air.current.pm25 ?? 0) / WHO_PM25_24H, 1)}× WHO daily guideline`}
              />
              <Detail
                label="Dominant pollutant"
                value={POLLUTANT_LABEL[official.dominant]}
                sub="Highest sub-index"
              />
              <Detail
                label="Mixing height"
                value={`${fmtInt(plan.current.blh ?? 0)} m`}
                sub={`Wind ${fmtDec(plan.current.wind ?? 0, 1)} km/h`}
              />
              <Detail
                label="Dispersion"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Dot
                      className={
                        plan.current.dispersion === 'good'
                          ? 'bg-green'
                          : plan.current.dispersion === 'moderate'
                            ? 'bg-amber'
                            : 'bg-red'
                      }
                    />
                    {plan.current.dispersion
                      ? DISPERSION_LABEL[plan.current.dispersion]
                      : 'Unknown'}
                  </span>
                }
                sub={
                  plan.current.ventilationCoefficient != null
                    ? `${fmtInt(plan.current.ventilationCoefficient)} m²/s ventilation`
                    : undefined
                }
              />
              <Detail
                label="Breathing this all day"
                value={`${fmtCig(cigarettesPerDay(air.current.pm25 ?? 0))} cigarettes`}
                sub="Berkeley Earth equivalence"
              />
              <Detail
                label="Source"
                value="Open-Meteo · CAMS"
                sub={`Updated ${relativeTime(air.fetchedAt)}`}
              />
            </dl>
            {offset !== 0 && disp && (
              <p className="mt-5 rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-muted">
                At {label}: {DISPERSION_LABEL[disp].toLowerCase()}, AQI {instant.aqi} hourly, PM2.5{' '}
                {fmtInt(pm)} µg/m³.
              </p>
            )}
          </div>
        </div>
        <CardFooter>
          <span>
            {plan.cleanWindow ? (
              <>
                Cleanest hour today:{' '}
                <strong className="font-medium text-fg">{plan.cleanWindow.start}</strong> at{' '}
                {plan.cleanWindow.pm25} µg/m³
              </>
            ) : (
              'No clean window found in the next 24 hours'
            )}
            {plan.lid.stagnantHours > 0 && (
              <> · Smog lid for {plan.lid.stagnantHours} of the next 24 h</>
            )}
          </span>
          <Link
            href="/forecast"
            className="inline-flex items-center gap-1 font-medium text-fg hover:underline"
          >
            Open forecast <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </CardFooter>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="Today’s routine"
            description={
              latest
                ? `Explained by ${latest.source === 'gemini' ? 'Gemini' : 'the rules engine'} ${relativeTime(latest.at)}`
                : 'Live from the planning engine. Deploy to add Gemini’s explanations.'
            }
            action={
              <Link href="/routine" className="text-[13px] font-medium text-fg hover:underline">
                View all {plan.items.length}
              </Link>
            }
          />
          <ul className="border-t border-line">
            {plan.items.slice(0, 5).map((item) => (
              <RoutineRow
                key={item.id}
                item={item}
                members={household.members}
                why={aiWhy.get(item.id)}
                done={done.has(item.id)}
                onToggleDone={() => toggleDone(item.id)}
                compact
              />
            ))}
          </ul>
        </Card>
        <BudgetCard members={plan.members} totals={plan.totals} />
      </div>
    </Page>
  );
}

function Page({
  children,
  description,
  actions,
}: {
  children: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Overview" description={description} actions={actions} />
      <PageBody>{children}</PageBody>
    </>
  );
}

function Detail({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-subtle">{sub}</dd>}
    </div>
  );
}

function HourStrip({
  air,
  levels,
  active,
  onPick,
}: {
  air: NonNullable<ReturnType<typeof useLocalPlan>['data']>;
  levels: AqiLevel[];
  active: number;
  onPick: (i: number) => void;
}) {
  const cells = [];
  for (let i = air.nowIndex; i < Math.min(air.hourly.length, air.nowIndex + 24); i++) cells.push(i);
  return (
    <div className="mt-3">
      <div
        className="flex h-6 gap-[2px]"
        role="group"
        aria-label="Next 24 hours by air quality. Hatched hours are under a smog lid."
      >
        {cells.map((i) => {
          const hr = air.hourly[i]!;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              aria-label={`${hr.time.slice(11, 16)}, PM2.5 ${fmtInt(hr.pm25 ?? 0)}${isLidHour(hr) ? ', smog lid' : ''}`}
              aria-pressed={i === active}
              className={cn(
                'relative flex-1 rounded-[3px] transition-transform duration-150 hover:scale-y-110',
                i === active && 'ring-2 ring-fg ring-offset-1 ring-offset-surface',
              )}
              style={{ background: aqiVar(levels[i]!) }}
            >
              {isLidHour(hr) && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[3px] bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.28)_0_2px,transparent_2px_5px)]"
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="tabular mt-1 flex justify-between text-[11px] text-subtle">
        <span>{air.hourly[cells[0]!]!.time.slice(11, 16)}</span>
        <span>{air.hourly[cells[Math.floor(cells.length / 2)]!]!.time.slice(11, 16)}</span>
        <span>{air.hourly[cells[cells.length - 1]!]!.time.slice(11, 16)}</span>
      </div>
    </div>
  );
}

function BudgetCard({
  members,
  totals,
}: {
  members: MemberSummary[];
  totals: { exposureCutPct: number; cigarettesAvoided: number };
}) {
  const maxRatio = Math.max(1, ...members.map((m) => m.baselineDoseUg / Math.max(1, m.budgetUg)));
  return (
    <Card>
      <CardHeader
        title="Exposure budget"
        description="Today’s inhaled PM2.5 against breathing WHO-guideline air on the same schedule."
      />
      <ul className="space-y-5 px-5 pb-5">
        {members.map((m) => {
          const before = m.baselineDoseUg / Math.max(1, m.budgetUg);
          const after = m.optimizedDoseUg / Math.max(1, m.budgetUg);
          return (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium text-fg">
                  <Avatar name={m.name} size={18} />
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="tabular text-xs text-muted">
                  {fmtDec(before, 1)}× →{' '}
                  <strong className="font-semibold text-fg">{fmtDec(after, 1)}×</strong>
                </span>
              </div>
              <div
                className="relative mt-2 h-2 overflow-hidden rounded-full bg-hover"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-red/45"
                  style={{ width: `${(before / maxRatio) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-fg"
                  style={{ width: `${(after / maxRatio) * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-green"
                  style={{ left: `${(1 / maxRatio) * 100}%` }}
                />
              </div>
              <p className="sr-only">
                {m.name}: {fmtDec(before, 1)} times the WHO budget as usual, {fmtDec(after, 1)}{' '}
                times with the plan.
              </p>
              <div className="tabular mt-1.5 flex justify-between text-xs text-subtle">
                <span>
                  {fmtDose(m.optimizedDoseUg)} of {fmtDose(m.budgetUg)} budget
                </span>
                <span>{fmtCig(m.optimizedCigarettes)} cig</span>
              </div>
            </li>
          );
        })}
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
