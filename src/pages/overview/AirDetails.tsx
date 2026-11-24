/** The overview's reading for the scrubbed hour: the AQI, its category and what is driving it. */
import type { ReactNode } from 'react';
import { AqiStatus, Dot, aqiTextVar } from '@/components/ui/primitives';
import { POLLUTANT_LABEL, aqiCategory } from '@/lib/air/aqi';
import type { AirSnapshot, AqiStandard } from '@/lib/air/types';
import { fmtCig, fmtDec, fmtInt, relativeTime } from '@/lib/format';
import type { PlanResult } from '@/lib/planner/engine';
import { WHO_PM25_24H, cigarettesPerDay } from '@/lib/science/exposure';
import { DISPERSION_LABEL, type Dispersion } from '@/lib/science/meteo';
import type { ScrubbedHour } from './scrub';

/** Green for good mixing, amber for moderate, red for poor, stagnant or unknown. */
function dispersionDot(dispersion: Dispersion | null): string {
  if (dispersion === 'good') return 'bg-green';
  if (dispersion === 'moderate') return 'bg-amber';
  return 'bg-red';
}

interface AirDetailsProps {
  air: AirSnapshot;
  plan: PlanResult;
  scrub: ScrubbedHour;
  standard: AqiStandard;
}

/** Right-hand column of the overview card: the official AQI and the numbers behind it. */
export function AirDetails({ air, plan, scrub, standard }: AirDetailsProps) {
  const pm25Now = air.current.pm25 ?? 0;
  const { current } = plan;
  return (
    <div className="border-t border-line p-5 lg:border-t-0 lg:border-l">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <AqiHeadline aqi={scrub.official.aqi} standard={standard} />
        <Detail
          label="PM2.5 now"
          value={`${fmtInt(pm25Now)} µg/m³`}
          sub={`${fmtDec(pm25Now / WHO_PM25_24H, 1)}× WHO daily guideline`}
        />
        <Detail
          label="Dominant pollutant"
          value={POLLUTANT_LABEL[scrub.official.dominant]}
          sub="Highest sub-index"
        />
        <Detail
          label="Mixing height"
          value={`${fmtInt(current.blh ?? 0)} m`}
          sub={`Wind ${fmtDec(current.wind ?? 0, 1)} km/h`}
        />
        <Detail
          label="Dispersion"
          value={<DispersionValue dispersion={current.dispersion} />}
          sub={
            current.ventilationCoefficient != null
              ? `${fmtInt(current.ventilationCoefficient)} m²/s ventilation`
              : undefined
          }
        />
        <Detail
          label="Breathing this all day"
          value={`${fmtCig(cigarettesPerDay(pm25Now))} cigarettes`}
          sub="Berkeley Earth equivalence"
        />
        <Detail
          label="Source"
          value="Open-Meteo · CAMS"
          sub={`Updated ${relativeTime(air.fetchedAt)}`}
        />
      </dl>
      {!scrub.isNow && scrub.dispersion && (
        <p className="mt-5 rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-muted">
          At {scrub.label}: {DISPERSION_LABEL[scrub.dispersion].toLowerCase()}, AQI{' '}
          {scrub.instant.aqi} hourly, PM2.5 {fmtInt(scrub.pm25)} µg/m³.
        </p>
      )}
    </div>
  );
}

interface AqiHeadlineProps {
  aqi: number;
  standard: AqiStandard;
}

/** The big official AQI number with its category and advice. */
function AqiHeadline({ aqi, standard }: AqiHeadlineProps) {
  const category = aqiCategory(aqi, standard);
  return (
    <div className="col-span-2">
      <dt className="text-[13px] text-muted">
        Air quality index · {standard === 'in' ? 'India NAQI' : 'US EPA'}
      </dt>
      <dd className="mt-1 flex items-baseline gap-3">
        <span
          className="tabular text-[44px] leading-none font-semibold tracking-[-0.04em]"
          style={{ color: aqiTextVar(category.level) }}
        >
          {aqi}
        </span>
        <AqiStatus level={category.level} label={category.label} />
      </dd>
      <dd className="mt-2 text-[13px] text-muted">{category.advice}</dd>
    </div>
  );
}

interface DispersionValueProps {
  dispersion: Dispersion | null;
}

/** Coloured dot and label for how well the air is dispersing. */
function DispersionValue({ dispersion }: DispersionValueProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <Dot className={dispersionDot(dispersion)} />
      {dispersion ? DISPERSION_LABEL[dispersion] : 'Unknown'}
    </span>
  );
}

interface DetailProps {
  label: string;
  value: ReactNode;
  sub?: string | undefined;
}

/** One term and value pair in the details list, with an optional footnote. */
function Detail({ label, value, sub }: DetailProps) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-subtle">{sub}</dd>}
    </div>
  );
}
