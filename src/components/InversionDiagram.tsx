/**
 * Hand-built SVG explainer for winter smog: smoke from chimneys and traffic rises until it hits
 * the warm-air lid at the live mixing height, then spreads sideways instead of escaping.
 * The lid line moves with the forecast; the loop pauses for reduced-motion users, offscreen and
 * in hidden tabs.
 */
import { useId, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { DISPERSION_LABEL, type Dispersion } from '@/lib/science/meteo';
import {
  GROUND,
  H,
  PUFF_COUNT,
  lidToY,
  sourceFor,
  useInversionAnimation,
} from './inversionAnimation';

export { lidToY } from './inversionAnimation';

export interface InversionDiagramProps {
  /** Boundary-layer (mixing) height in metres. */
  blh: number;
  /** Wind speed in km/h. */
  wind: number;
  /** Ventilation coefficient in m²/s, or null when the forecast lacks it. */
  vc: number | null;
  dispersion: Dispersion | null;
}

/** The warm and cold air masses, the dashed lid between them and their labels. */
function LidLayers({ lid, blh }: { lid: number; blh: number }) {
  return (
    <>
      <rect x="0" y={lid} width="400" height={GROUND - lid} fill="var(--blue)" opacity="0.06" />
      <rect x="0" y="0" width="400" height={lid} fill="var(--amber)" opacity="0.05" />
      <line
        className="lid-line"
        x1="0"
        x2="400"
        y1={lid}
        y2={lid}
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeDasharray="8 4"
      />
      <text x="10" y={lid - 8} fontSize="11" fill="var(--amber)" fontWeight="600">
        Warm-air lid · {Math.round(blh)} m
      </text>
      <text x="10" y={Math.min(GROUND - 34, lid + 18)} fontSize="11" fill="var(--muted)">
        Cold air trapped below
      </text>
    </>
  );
}

/** The skyline, two chimneys, a car, the street and the smoke puffs waiting at their sources. */
function Street() {
  return (
    <>
      {/* skyline */}
      <path
        d={`M0 ${GROUND} V172 h26 v-8 h22 v12 h18 v-22 h14 v-5 h6 v5 h12 v24 h30 v-14 h24 v8 h20 v-28 h16 v-5 h8 v5 h12 v30 h26 v-12 h22 v6 h20 v-20 h18 v24 h28 v-10 h30 V${GROUND} Z`}
        fill="var(--line-strong)"
      />
      {/* chimneys */}
      <rect x="70" y="146" width="8" height="30" fill="var(--subtle)" />
      <rect x="244" y="142" width="8" height="34" fill="var(--subtle)" />
      {/* car */}
      <rect x="316" y={GROUND - 12} width="26" height="9" rx="3" fill="var(--subtle)" />
      <line x1="0" x2="400" y1={GROUND} y2={GROUND} stroke="var(--line-strong)" />
      {Array.from({ length: PUFF_COUNT }, (_, i) => (
        <circle
          key={i}
          className="puff"
          cx={sourceFor(i).x}
          cy={sourceFor(i).y}
          r="3"
          fill="var(--muted)"
          opacity="0"
        />
      ))}
    </>
  );
}

interface ReadingsProps {
  blh: number;
  wind: number;
  vcText: string;
  dispersion: Dispersion | null;
}

/** The three numbers under the diagram: mixing height, wind and ventilation. */
function Readings({ blh, wind, vcText, dispersion }: ReadingsProps) {
  return (
    <figcaption className="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div>
        <div className="text-subtle">Mixing height</div>
        <div className="tabular font-medium text-fg">{Math.round(blh)} m</div>
      </div>
      <div>
        <div className="text-subtle">Wind</div>
        <div className="tabular font-medium text-fg">{wind.toFixed(1)} km/h</div>
      </div>
      <div>
        <div className="text-subtle">Ventilation</div>
        <div className="tabular font-medium text-fg">{vcText}</div>
        {dispersion && <div className="text-muted">{DISPERSION_LABEL[dispersion]}</div>}
      </div>
    </figcaption>
  );
}

/** Animated explainer of a temperature inversion trapping smoke under the live mixing height. */
export function InversionDiagram({ blh, wind, vc, dispersion }: InversionDiagramProps) {
  const root = useRef<SVGSVGElement>(null);
  const reduced = usePrefersReducedMotion();
  const lid = lidToY(blh);
  const uid = useId();
  useInversionAnimation(root, { lid, wind, reduced });

  const vcText = vc == null ? 'n/a' : `${Math.round(vc).toLocaleString('en-IN')} m²/s`;

  return (
    <figure className="m-0">
      <svg
        ref={root}
        viewBox={`0 0 400 ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-labelledby={`${uid}-t`}
        aria-describedby={`${uid}-d`}
      >
        <title id={`${uid}-t`}>Temperature inversion diagram</title>
        <desc id={`${uid}-d`}>
          {`A warm-air lid sits ${Math.round(blh)} metres above the city. Smoke from chimneys and traffic rises until it meets the lid and then spreads sideways, trapping pollution near the ground. Ventilation coefficient ${vcText}.`}
        </desc>
        <LidLayers lid={lid} blh={blh} />
        <Street />
      </svg>
      <Readings blh={blh} wind={wind} vcText={vcText} dispersion={dispersion} />
    </figure>
  );
}
