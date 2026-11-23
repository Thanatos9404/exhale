import { useId, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useReducedMotion } from 'motion/react';
import { DISPERSION_LABEL, type Dispersion } from '@/lib/science/meteo';

gsap.registerPlugin(useGSAP);

/**
 * Hand-built SVG explainer for winter smog: smoke from chimneys and traffic rises until it hits
 * the warm-air lid at the live mixing height, then spreads sideways instead of escaping.
 * The lid line moves with the forecast; the loop pauses for reduced-motion users.
 */

const H = 220;
const GROUND = 188;

export function lidToY(blh: number): number {
  const t = Math.log10(Math.max(10, Math.min(3000, blh)) / 10) / Math.log10(300);
  return Math.round(GROUND - 22 - t * (GROUND - 52));
}

const SOURCES = [
  { x: 74, y: 146 },
  { x: 248, y: 142 },
  { x: 330, y: GROUND - 8 },
];

export function InversionDiagram({ blh, wind, vc, dispersion }: { blh: number; wind: number; vc: number | null; dispersion: Dispersion | null }) {
  const root = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const lid = lidToY(blh);
  const uid = useId();

  useGSAP(
    () => {
      const puffs = gsap.utils.toArray<SVGCircleElement>('.puff', root.current);
      puffs.forEach((p, i) => {
        const src = SOURCES[i % SOURCES.length]!;
        const spread = (i % 2 ? 1 : -1) * (40 + (i * 13) % 60);
        const ceiling = lid + 6 + (i % 3) * 5;
        if (reduced) {
          gsap.set(p, { attr: { cx: src.x + spread * 0.8, cy: ceiling + 4, r: 9 }, opacity: 0.45 });
          return;
        }
        gsap
          .timeline({ repeat: -1, delay: (i * 0.45) % 5 })
          .set(p, { attr: { cx: src.x, cy: src.y, r: 3 }, opacity: 0 })
          .to(p, { opacity: 0.6, duration: 0.4, ease: 'none' })
          .to(p, { attr: { cy: ceiling, r: 7 }, duration: 1.6 + (src.y - ceiling) / 120, ease: 'power1.out' }, '<')
          .to(p, { attr: { cx: src.x + spread + wind * 2, r: 12 }, opacity: 0.35, duration: 2.4, ease: 'sine.out' })
          .to(p, { opacity: 0, duration: 0.8, ease: 'none' });
      });
      gsap.to('.lid-line', { strokeDashoffset: -24, duration: 2, repeat: reduced ? 0 : -1, ease: 'none' });
    },
    { scope: root, dependencies: [lid, reduced, wind], revertOnUpdate: true },
  );

  const vcText = vc == null ? 'n/a' : `${Math.round(vc).toLocaleString('en-IN')} m²/s`;

  return (
    <figure className="m-0">
      <svg ref={root} viewBox={`0 0 400 ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`}>
        <title id={`${uid}-t`}>Temperature inversion diagram</title>
        <desc id={`${uid}-d`}>
          {`A warm-air lid sits ${Math.round(blh)} metres above the city. Smoke from chimneys and traffic rises until it meets the lid and then spreads sideways, trapping pollution near the ground. Ventilation coefficient ${vcText}.`}
        </desc>
        <rect x="0" y={lid} width="400" height={GROUND - lid} fill="var(--blue)" opacity="0.06" />
        <rect x="0" y="0" width="400" height={lid} fill="var(--amber)" opacity="0.05" />
        <line className="lid-line" x1="0" x2="400" y1={lid} y2={lid} stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="8 4" />
        <text x="10" y={lid - 8} fontSize="11" fill="var(--amber)" fontWeight="600">
          Warm-air lid · {Math.round(blh)} m
        </text>
        <text x="10" y={Math.min(GROUND - 34, lid + 18)} fontSize="11" fill="var(--muted)">
          Cold air trapped below
        </text>
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
        {Array.from({ length: 15 }, (_, i) => (
          <circle key={i} className="puff" cx={SOURCES[i % 3]!.x} cy={SOURCES[i % 3]!.y} r="3" fill="var(--muted)" opacity="0" />
        ))}
      </svg>
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
    </figure>
  );
}
