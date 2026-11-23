import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { AqiStatus, Card, CardFooter, CardHeader, Field, Segmented, Switch, aqiVar, inputClass } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { RoomParticles } from '@/components/RoomParticles';
import { useAir } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { aqiCategory, computeAqi } from '@/lib/air/aqi';
import { cigarettesPerDay } from '@/lib/science/exposure';
import { EXHAUST_CAPTURE, PURIFIER_CADR, SOURCE_RATE, simulateRoom, type Purifier, type Ventilation } from '@/lib/science/indoor';
import { fmtCig, fmtDec, fmtInt } from '@/lib/format';

type SourceKey = 'frying' | 'incense' | 'coil' | 'cigarette' | 'candle';

const SOURCES: { key: SourceKey; label: string; rate: number }[] = [
  { key: 'frying', label: 'Frying on a gas stove', rate: SOURCE_RATE.fryingGas },
  { key: 'incense', label: 'Incense stick', rate: SOURCE_RATE.incense },
  { key: 'coil', label: 'Mosquito coil', rate: SOURCE_RATE.mosquitoCoil },
  { key: 'cigarette', label: 'Cigarette indoors', rate: SOURCE_RATE.cigarette },
  { key: 'candle', label: 'Candle', rate: SOURCE_RATE.candle },
];

const PURIFIERS: { value: Purifier; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: `Small (${PURIFIER_CADR.small} m³/h)` },
  { value: 'medium', label: `Medium (${PURIFIER_CADR.medium} m³/h)` },
  { value: 'large', label: `Large (${PURIFIER_CADR.large} m³/h)` },
  { value: 'diy', label: `DIY box-fan filter (${PURIFIER_CADR.diy} m³/h)` },
];

interface Room {
  outdoor: number;
  area: number;
  ventilation: Ventilation;
  windowsOpen: boolean;
  purifier: Purifier;
  exhaust: boolean;
  sources: Set<SourceKey>;
}

function sourceRate(room: Room): number {
  let s = 0;
  for (const src of SOURCES) {
    if (!room.sources.has(src.key)) continue;
    s += src.key === 'frying' && room.exhaust ? src.rate * (1 - EXHAUST_CAPTURE) : src.rate;
  }
  return s;
}

const simulate = (room: Room) =>
  simulateRoom({
    outdoorPm25: room.outdoor,
    areaM2: room.area,
    ventilation: room.ventilation,
    windowsOpen: room.windowsOpen,
    purifier: room.purifier,
    sourceUgPerHour: sourceRate(room),
  });

export default function Indoor() {
  const { household } = useAppState();
  const air = useAir();
  const live = Math.round(air.data?.current.pm25 ?? 120);
  const initial = useMemo<Room>(
    () => ({
      outdoor: live,
      area: household.home.areaM2,
      ventilation: household.home.ventilation,
      windowsOpen: false,
      purifier: household.home.purifier,
      exhaust: household.home.kitchenExhaust,
      sources: new Set<SourceKey>([...(household.home.incense ? (['incense'] as const) : []), ...(household.home.mosquitoCoil ? (['coil'] as const) : [])]),
    }),
    [live, household.home],
  );
  const [room, setRoom] = useState<Room | null>(null);
  const r = room ?? initial;
  const set = (patch: Partial<Room>) => setRoom({ ...r, ...patch });

  const res = simulate(r);
  const cat = aqiCategory(computeAqi({ pm25: res.indoorPm25 }, household.standard).aqi, household.standard);

  const wins = useMemo(() => {
    const out: { label: string; next: Room }[] = [];
    if (r.windowsOpen) out.push({ label: 'Shut the windows', next: { ...r, windowsOpen: false } });
    if (r.sources.size > 0) out.push({ label: 'Remove every indoor smoke source', next: { ...r, sources: new Set() } });
    if (r.sources.has('frying') && !r.exhaust) out.push({ label: 'Turn the kitchen hood on', next: { ...r, exhaust: true } });
    if (r.purifier === 'none') out.push({ label: 'Add a DIY box-fan filter', next: { ...r, purifier: 'diy' } });
    else if (r.purifier === 'small') out.push({ label: 'Upgrade to a large purifier', next: { ...r, purifier: 'large' } });
    if (r.ventilation === 'leaky') out.push({ label: 'Draught-proof doors and windows', next: { ...r, ventilation: 'normal' } });
    return out
      .map((w) => ({ ...w, after: simulate(w.next).indoorPm25 }))
      .filter((w) => w.after < res.indoorPm25 - 0.5)
      .sort((a, b) => a.after - b.after);
  }, [r, res.indoorPm25]);

  return (
    <>
      <PageHeader
        title="Indoor lab"
        description="A physics model of one room. Change anything and watch what happens to the air your family breathes for most of the day."
        actions={
          <Button leading={<RotateCcw size={14} aria-hidden="true" />} onClick={() => setRoom(null)}>
            Reset to my home
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Room settings" description="Starts from your household profile and live outdoor air." />
            <div className="space-y-5 px-5 pb-5">
              <Field label={`Outdoor PM2.5: ${fmtInt(r.outdoor)} µg/m³`} hint={`Live reading here: ${live} µg/m³`}>
                {(id, d) => <input id={id} aria-describedby={d} type="range" min={0} max={500} value={r.outdoor} onChange={(e) => set({ outdoor: Number(e.target.value) })} className="w-full" />}
              </Field>
              <Field label={`Area kept closed: ${r.area} m²`} hint="The rooms you keep shut together, e.g. a 2BHK is about 45 to 60 m².">
                {(id, d) => <input id={id} aria-describedby={d} type="range" min={8} max={150} value={r.area} onChange={(e) => set({ area: Number(e.target.value) })} className="w-full" />}
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-muted" id="draught">Draught-proofing</span>
                <Segmented<Ventilation>
                  label="Draught-proofing"
                  value={r.ventilation}
                  onChange={(v) => set({ ventilation: v })}
                  options={[{ value: 'sealed', label: 'Sealed' }, { value: 'normal', label: 'Typical' }, { value: 'leaky', label: 'Leaky' }]}
                />
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="win" className="text-[13px] font-medium text-muted">Windows open</label>
                <Switch id="win" checked={r.windowsOpen} onChange={(v) => set({ windowsOpen: v })} label="Windows open" />
              </div>
              <Field label="Air purifier">
                {(id) => (
                  <select id={id} className={inputClass} value={r.purifier} onChange={(e) => set({ purifier: e.target.value as Purifier })}>
                    {PURIFIERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-muted">Burning right now</legend>
                <div className="space-y-2">
                  {SOURCES.map((s) => (
                    <label key={s.key} className="flex items-center gap-2.5 text-sm text-fg">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--fg)]"
                        checked={r.sources.has(s.key)}
                        onChange={(e) => {
                          const next = new Set(r.sources);
                          if (e.target.checked) next.add(s.key);
                          else next.delete(s.key);
                          set({ sources: next });
                        }}
                      />
                      {s.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2.5 text-sm text-fg">
                    <input type="checkbox" className="size-4 accent-[var(--fg)]" checked={r.exhaust} onChange={(e) => set({ exhaust: e.target.checked })} />
                    Kitchen hood running
                  </label>
                </div>
              </fieldset>
            </div>
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="relative h-[280px] border-b border-line md:h-auto md:border-r md:border-b-0">
                  <div className="absolute inset-4">
                    <RoomParticles indoor={res.indoorPm25} windowsOpen={r.windowsOpen} purifierOn={r.purifier !== 'none'} sourceOn={r.sources.size > 0} />
                  </div>
                </div>
                <dl className="space-y-4 p-5" aria-live="polite">
                  <div>
                    <dt className="text-[13px] text-muted">Indoor PM2.5</dt>
                    <dd className="mt-1 flex items-baseline gap-2">
                      <span className="tabular text-[40px] leading-none font-semibold tracking-[-0.04em]" style={{ color: aqiVar(cat.level) }}>
                        {fmtInt(res.indoorPm25)}
                      </span>
                      <span className="text-sm text-muted">µg/m³</span>
                    </dd>
                    <dd className="mt-2"><AqiStatus level={cat.level} label={cat.label} /></dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Compared with outdoors</dt>
                    <dd className="tabular mt-1 text-sm font-medium text-fg">{r.outdoor > 0 ? `${fmtInt(res.ratio * 100)}% of outdoor air` : 'n/a'}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">Settles in about</dt>
                    <dd className="tabular mt-1 text-sm font-medium text-fg">{fmtInt(res.timeConstantMin * 3)} min</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] text-muted">A full day in this air</dt>
                    <dd className="tabular mt-1 text-sm font-medium text-fg">{fmtCig(cigarettesPerDay(res.indoorPm25))} cigarettes</dd>
                  </div>
                </dl>
              </div>
              <CardFooter>
                <span>
                  Window on the left edge, purifier bottom right. Model: C<sub>in</sub> = (P·a·C<sub>out</sub> + S/V) / (a + k + CADR/V), {fmtInt(res.volumeM3)} m³, {fmtDec(res.purifierAch, 1)} clean-air changes an hour
                </span>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader title="Quick wins for this room" description="Each change on its own, ranked by the indoor PM2.5 it leaves you with." />
              {wins.length === 0 ? (
                <p className="px-5 pb-5 text-[13px] text-muted">This room is already set up as well as the model allows. Keep the door shut and the filter running.</p>
              ) : (
                <ul className="border-t border-line">
                  {wins.map((w) => {
                    const cut = ((res.indoorPm25 - w.after) / Math.max(1, res.indoorPm25)) * 100;
                    return (
                      <li key={w.label} className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                        <span className="min-w-0 flex-1 text-sm font-medium text-fg">{w.label}</span>
                        <span className="tabular text-[13px] text-muted">
                          {fmtInt(res.indoorPm25)} → <strong className="font-semibold text-fg">{fmtInt(w.after)}</strong> µg/m³
                        </span>
                        <span className="tabular w-14 text-right text-[13px] font-medium text-green">−{fmtInt(cut)}%</span>
                        <Button size="sm" variant="tertiary" onClick={() => setRoom(w.next)}>
                          Apply
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  );
}
