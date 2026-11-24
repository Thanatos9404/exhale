/**
 * A static stand-in for the 3D air column: an inline SVG cross-section with the same two facts
 * (how low the lid sits, how much PM2.5 is under it) at a fraction of the cost. It is what
 * data-saver users keep, and what everyone sees until the 3D scene has loaded.
 */
import type { ReactNode } from 'react';
import { seededRandom } from '@/components/three/random';
import { aqiVar } from '@/components/ui/primitives';
import type { AqiLevel } from '@/lib/air/aqi';
import { fmtInt } from '@/lib/format';

/** The sketch is drawn at the frame's own 16:11 shape, so it fills it without distortion. */
const W = 320;
const H = 220;
const GROUND = 184;
/** The lid's highest and lowest positions in the sketch. */
const LID_TOP = 38;
const LID_BOTTOM = 166;
/** Dots drawn when the column is full (PM2.5 of 220 µg/m³ and above). */
const MAX_DOTS = 90;

/** Maps mixing height (m) to the lid's y, compressing the top like the 3D scene does. */
export function posterLidY(blh: number): number {
  const t = Math.pow(Math.min(1, Math.max(0, blh) / 1500), 0.6);
  return Math.round(LID_BOTTOM - t * (LID_BOTTOM - LID_TOP));
}

/** How many dots stand for a PM2.5 level; clean air still shows a few. */
export function posterDotCount(pm25: number): number {
  return Math.round(Math.min(1, Math.max(0.04, pm25 / 220)) * MAX_DOTS);
}

interface Dot {
  x: number;
  /** Height as a share of the space under the lid, so a falling lid squeezes the same dots. */
  rise: number;
  r: number;
  opacity: number;
}

/** A fixed field of dots; each PM2.5 level shows the first few of them. */
const DOTS: Dot[] = (() => {
  const rand = seededRandom(7);
  return Array.from({ length: MAX_DOTS }, () => ({
    x: 14 + rand() * (W - 28),
    rise: rand(),
    r: 1 + rand() * 1.3,
    opacity: 0.3 + rand() * 0.5,
  }));
})();

/** A fixed skyline, taller towards the middle. */
const BUILDINGS = (() => {
  const rand = seededRandom(42);
  return Array.from({ length: 19 }, (_, i) => {
    const x = 16 + i * 15.4;
    const centre = 1 - Math.abs(x - W / 2) / (W / 2);
    return { x, w: 9 + rand() * 4, h: 6 + rand() * 12 + centre * centre * 22 * rand() };
  });
})();

interface AirColumnPosterProps {
  /** Mixing height in metres. */
  blh: number;
  /** PM2.5 in µg/m³. */
  pm25: number;
  level: AqiLevel;
  /** What sits under the facts: the button that loads the 3D view, or a loading note. */
  action: ReactNode;
}

/** The static air column: skyline, smog dots under a dashed lid, and the two facts as text. */
export function AirColumnPoster({ blh, pm25, level, action }: AirColumnPosterProps) {
  const lid = posterLidY(blh);
  const facts = `Lid ${fmtInt(blh)} m · PM2.5 ${fmtInt(pm25)} µg/m³`;
  return (
    <div className="absolute inset-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full"
        role="img"
        aria-label={`Sketch of the air column: smog trapped under a lid at ${fmtInt(blh)} metres, PM2.5 ${fmtInt(pm25)} micrograms per cubic metre`}
      >
        <rect x="0" y={lid} width={W} height={GROUND - lid} fill={aqiVar(level)} opacity="0.07" />
        {DOTS.slice(0, posterDotCount(pm25)).map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={GROUND - 3 - d.rise * (GROUND - lid - 7)}
            r={d.r}
            fill={aqiVar(level)}
            opacity={d.opacity}
          />
        ))}
        {BUILDINGS.map((b) => (
          <rect key={b.x} x={b.x} y={GROUND - b.h} width={b.w} height={b.h} fill="var(--subtle)" />
        ))}
        <line x1="0" x2={W} y1={GROUND} y2={GROUND} stroke="var(--line-strong)" />
        <line
          x1="10"
          x2={W - 10}
          y1={lid}
          y2={lid}
          stroke="var(--amber)"
          strokeWidth="1.5"
          strokeDasharray="7 4"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-start justify-items-center p-4 pt-11 sm:place-items-center sm:pt-4">
        <div className="flex flex-col items-center gap-2 rounded-md border border-line bg-surface/80 px-3 py-2 text-center backdrop-blur">
          <p className="tabular text-[13px] font-medium text-fg">{facts}</p>
          <div className="flex h-7 items-center text-xs text-subtle">{action}</div>
        </div>
      </div>
    </div>
  );
}
