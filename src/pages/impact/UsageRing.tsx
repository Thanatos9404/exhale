/**
 * SVG usage ring for one person's dose, where a full circle is their WHO budget. Past 100% the
 * ring cannot fill further, so it turns red and shows the multiple instead.
 */
import { fmtDec } from '@/lib/format';

const SIZE = 60;
const CENTER = SIZE / 2;
const RADIUS = 22;
const STROKE = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface UsageRingProps {
  /** Share of the daily budget used, in percent; may exceed 100. */
  pct: number;
}

/** Usage ring: full circle = WHO budget; beyond 100% the ring turns red and shows the multiple. */
export function UsageRing({ pct }: UsageRingProps) {
  const over = pct > 100;
  const shown = Math.min(100, pct);
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`${Math.round(pct)}% of daily WHO budget`}
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="var(--hover)"
        strokeWidth={STROKE}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={over ? 'var(--red)' : 'var(--green)'}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      />
      <text
        x={CENTER}
        y={CENTER}
        textAnchor="middle"
        dy="0.35em"
        fontSize="11"
        fontWeight="600"
        fill="var(--fg)"
        className="tabular"
      >
        {over ? `${fmtDec(pct / 100, 1)}×` : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}
