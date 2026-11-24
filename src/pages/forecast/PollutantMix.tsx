/** Donut and legend of how far each pollutant is over its WHO guideline right now. */
import { lazy, Suspense, useMemo, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/primitives';
import { useCssVars, hasWebGL } from '@/hooks/useThemeColors';
import { POLLUTANT_LABEL } from '@/lib/air/aqi';
import type { HourPoint } from '@/lib/air/types';
import { fmtDec, fmtInt } from '@/lib/format';
import { SEGMENT_COLOR_VARS } from './metrics';
import { pollutantSegments, worstSegment, type PollutantSegment } from './series';

const ParticleDonut = lazy(() => import('@/components/three/ParticleDonut'));

/** No legend row hovered or focused. */
const NO_HOVER = -1;

interface PollutantMixProps {
  now: HourPoint;
}

/** Donut and legend of how far each pollutant is over its WHO guideline right now. */
export function PollutantMix({ now }: PollutantMixProps) {
  const [hovered, setHovered] = useState(NO_HOVER);
  const colors = useCssVars(SEGMENT_COLOR_VARS);
  const webgl = useMemo(() => hasWebGL(), []);
  const segments = pollutantSegments(now, colors);
  const top = segments[hovered] ?? worstSegment(segments);
  const maxRatio = Math.max(...segments.map((s) => s.ratio), 1);

  return (
    <Card>
      <CardHeader
        title="Pollutant mix"
        description="Each arc is how many times over its WHO guideline a pollutant is right now."
      />
      <div className="relative mx-5 aspect-square max-h-[260px] w-auto">
        {webgl ? (
          <Suspense fallback={null}>
            <ParticleDonut
              segments={segments.map((s) => ({ key: s.key, value: s.ratio, color: s.color }))}
              hover={hovered}
            />
          </Suspense>
        ) : null}
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="tabular text-2xl font-semibold tracking-[-0.03em] text-fg">
              {fmtDec(top.ratio, 1)}×
            </div>
            <div className="text-xs text-muted">{POLLUTANT_LABEL[top.key]} vs WHO</div>
          </div>
        </div>
      </div>
      <ul className="space-y-1 px-3 pb-4" onPointerLeave={() => setHovered(NO_HOVER)}>
        {segments.map((s, i) => (
          <li key={s.key}>
            <SegmentRow
              segment={s}
              concentration={now[s.key] ?? 0}
              maxRatio={maxRatio}
              onHover={() => setHovered(i)}
              onLeave={() => setHovered(NO_HOVER)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface SegmentRowProps {
  segment: PollutantSegment;
  /** Current concentration, µg/m³. */
  concentration: number;
  maxRatio: number;
  onHover: () => void;
  onLeave: () => void;
}

function SegmentRow({ segment, concentration, maxRatio, onHover, onLeave }: SegmentRowProps) {
  const label = POLLUTANT_LABEL[segment.key];
  return (
    <button
      type="button"
      onPointerEnter={onHover}
      onFocus={onHover}
      onBlur={onLeave}
      className="relative flex h-9 w-full items-center justify-between overflow-hidden rounded-md px-2 text-[13px] hover:bg-hover"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-[4px] opacity-15"
        style={{ width: `${(segment.ratio / maxRatio) * 96}%`, background: segment.color }}
      />
      <span className="relative inline-flex items-center gap-2 font-medium text-fg">
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: segment.color }}
        />
        {label}
      </span>{' '}
      <span className="tabular relative text-muted">
        {fmtInt(concentration)} µg/m³ · {fmtDec(segment.ratio, 1)}×
      </span>
      {/* The visible text is the button's name; this spells out its units for screen readers. */}
      <span className="sr-only">
        , {fmtInt(concentration)} micrograms per cubic metre, {fmtDec(segment.ratio, 1)} times the
        WHO guideline
      </span>
    </button>
  );
}
