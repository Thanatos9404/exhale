import { lazy, Suspense } from 'react';
import { Badge, Dot } from '@/components/ui/primitives';
import { fmtInt } from '@/lib/format';
import { isLidHour } from '@/lib/science/meteo';
import type { ScrubbedHour } from './scrub';

const AirColumn = lazy(() => import('@/components/three/AirColumn'));

interface AirColumnPreviewProps {
  scrub: ScrubbedHour;
  webgl: boolean;
}

/** The 3D air column for the scrubbed hour, or a text fallback where WebGL is missing. */
export function AirColumnPreview({ scrub, webgl }: AirColumnPreviewProps) {
  const { hour, pm25 } = scrub;
  const blh = hour.blh ?? 0;
  return (
    <div className="bg-grid relative aspect-[16/11] overflow-hidden rounded-lg border border-line bg-surface-2">
      {webgl ? (
        <Suspense
          fallback={
            <div className="absolute inset-0 grid place-items-center text-xs text-subtle">
              Loading 3D air column…
            </div>
          }
        >
          <AirColumn pm25={pm25} blh={hour.blh ?? 800} wind={hour.wind ?? 5} level={scrub.level} />
        </Suspense>
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
