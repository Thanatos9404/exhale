/**
 * The overview's air column for the scrubbed hour. A static poster holds its place; the 3D scene
 * (and three.js with it) loads only once the preview is on screen and the browser is idle, or
 * when a data-saver user asks for it.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Dot } from '@/components/ui/primitives';
import { prefersReducedData } from '@/hooks/idle';
import { useIdleInView } from '@/hooks/useIdleInView';
import { fmtInt } from '@/lib/format';
import { isLidHour } from '@/lib/science/meteo';
import { AirColumnPoster } from './AirColumnPoster';
import type { ScrubbedHour } from './scrub';

const AirColumn = lazy(() => import('@/components/three/AirColumn'));

const LOADING_NOTE = 'Loading 3D air column…';

interface AirColumnPreviewProps {
  scrub: ScrubbedHour;
  webgl: boolean;
}

interface ColumnProps {
  scrub: ScrubbedHour;
  /** True once the 3D scene may load. */
  load: boolean;
  /** Set for data-saver users: the scene waits for this button instead of loading by itself. */
  onAsk: (() => void) | null;
}

/** The poster until the scene may load, then the scene, with the poster covering the download. */
function Column({ scrub, load, onAsk }: ColumnProps) {
  const { hour, pm25, level } = scrub;
  const poster = { blh: hour.blh ?? 0, pm25, level };
  if (!load) {
    const action = onAsk ? (
      <Button size="sm" onClick={onAsk} leading={<Box size={14} aria-hidden="true" />}>
        Show 3D view
      </Button>
    ) : (
      LOADING_NOTE
    );
    return <AirColumnPoster {...poster} action={action} />;
  }
  return (
    <Suspense fallback={<AirColumnPoster {...poster} action={LOADING_NOTE} />}>
      <AirColumn pm25={pm25} blh={hour.blh ?? 800} wind={hour.wind ?? 5} level={level} />
    </Suspense>
  );
}

/** The air column for the scrubbed hour: poster, then 3D; or a text fallback without WebGL. */
export function AirColumnPreview({ scrub, webgl }: AirColumnPreviewProps) {
  const { hour, pm25 } = scrub;
  const blh = hour.blh ?? 0;
  const frame = useRef<HTMLDivElement>(null);
  const [dataSaver] = useState(prefersReducedData);
  const [asked, setAsked] = useState(false);
  const idleInView = useIdleInView(frame, webgl && !dataSaver);

  const ask = () => {
    setAsked(true);
    // The button is about to go; keep keyboard focus on the view it opened.
    frame.current?.focus();
  };

  return (
    <div
      ref={frame}
      tabIndex={-1}
      role="group"
      aria-label="Air column"
      className="bg-grid relative aspect-[16/11] overflow-hidden rounded-lg border border-line bg-surface-2"
    >
      {webgl ? (
        <Column scrub={scrub} load={asked || idleInView} onAsk={dataSaver ? ask : null} />
      ) : (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-muted">
          3D view needs WebGL. Mixing height {fmtInt(blh)} m, PM2.5 {fmtInt(pm25)} µg/m³.
        </div>
      )}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <Badge tone={scrub.isNow ? 'green' : 'neutral'}>
          {scrub.isNow && <Dot className="bg-green" pulse />}
          {scrub.label}
        </Badge>
        {isLidHour(hour) && <Badge tone="amber">Smog lid {fmtInt(blh)} m</Badge>}
      </div>
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-md border border-line bg-surface/80 px-2 py-1 text-[11px] text-muted backdrop-blur">
        Particles ∝ PM2.5 · lid = mixing height · drift = wind
      </div>
    </div>
  );
}
