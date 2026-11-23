import { aqiCategory, computeAqi, type AqiCategory } from '@/lib/air/aqi';
import type { AqiStandard } from '@/lib/air/types';
import type { Household } from '@/lib/profile/schema';
import {
  EXHAUST_CAPTURE,
  PURIFIER_CADR,
  SOURCE_RATE,
  simulateRoom,
  type Purifier,
  type RoomResult,
  type Ventilation,
} from '@/lib/science/indoor';

/** An indoor smoke source the lab can switch on. */
export type SourceKey = 'frying' | 'incense' | 'coil' | 'cigarette' | 'candle';

/** Smoke sources the lab offers, with their emission rates in µg/h. */
export const SOURCES: readonly { key: SourceKey; label: string; rate: number }[] = [
  { key: 'frying', label: 'Frying on a gas stove', rate: SOURCE_RATE.fryingGas },
  { key: 'incense', label: 'Incense stick', rate: SOURCE_RATE.incense },
  { key: 'coil', label: 'Mosquito coil', rate: SOURCE_RATE.mosquitoCoil },
  { key: 'cigarette', label: 'Cigarette indoors', rate: SOURCE_RATE.cigarette },
  { key: 'candle', label: 'Candle', rate: SOURCE_RATE.candle },
];

/** Purifier choices, labelled with their clean-air delivery rate. */
export const PURIFIERS: readonly { value: Purifier; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'small', label: `Small (${PURIFIER_CADR.small} m³/h)` },
  { value: 'medium', label: `Medium (${PURIFIER_CADR.medium} m³/h)` },
  { value: 'large', label: `Large (${PURIFIER_CADR.large} m³/h)` },
  { value: 'diy', label: `DIY box-fan filter (${PURIFIER_CADR.diy} m³/h)` },
];

/** Narrows a `<select>` value to one of the purifier options. */
export function isPurifier(value: string): value is Purifier {
  return PURIFIERS.some((p) => p.value === value);
}

/** Everything the lab lets you change about one room. */
export interface Room {
  /** Outdoor PM2.5, µg/m³. */
  outdoor: number;
  /** Floor area kept closed together, m². */
  area: number;
  ventilation: Ventilation;
  windowsOpen: boolean;
  purifier: Purifier;
  exhaust: boolean;
  sources: Set<SourceKey>;
}

/** The room as the household profile describes it, with today's live outdoor PM2.5. */
export function roomFromHome(home: Household['home'], outdoor: number): Room {
  return {
    outdoor,
    area: home.areaM2,
    ventilation: home.ventilation,
    windowsOpen: false,
    purifier: home.purifier,
    exhaust: home.kitchenExhaust,
    sources: new Set<SourceKey>([
      ...(home.incense ? (['incense'] as const) : []),
      ...(home.mosquitoCoil ? (['coil'] as const) : []),
    ]),
  };
}

/** Total indoor emissions, µg/h; the kitchen hood captures part of the frying smoke. */
export function sourceRate(room: Room): number {
  let s = 0;
  for (const src of SOURCES) {
    if (!room.sources.has(src.key)) continue;
    s += src.key === 'frying' && room.exhaust ? src.rate * (1 - EXHAUST_CAPTURE) : src.rate;
  }
  return s;
}

/** Runs the steady-state room model for this room. */
export function simulate(room: Room): RoomResult {
  return simulateRoom({
    outdoorPm25: room.outdoor,
    areaM2: room.area,
    ventilation: room.ventilation,
    windowsOpen: room.windowsOpen,
    purifier: room.purifier,
    sourceUgPerHour: sourceRate(room),
  });
}

/** The AQI category for an indoor PM2.5 level under the household's standard. */
export function indoorCategory(pm25: number, standard: AqiStandard): AqiCategory {
  return aqiCategory(computeAqi({ pm25 }, standard).aqi, standard);
}

interface RoomChange {
  label: string;
  next: Room;
}

/** A single change to the room and the indoor PM2.5 it would leave. */
export interface QuickWin extends RoomChange {
  after: number;
}

/** Wins smaller than this, µg/m³, are not worth listing. */
const MIN_GAIN = 0.5;

function candidateChanges(room: Room): RoomChange[] {
  const out: RoomChange[] = [];
  if (room.windowsOpen)
    out.push({ label: 'Shut the windows', next: { ...room, windowsOpen: false } });
  if (room.sources.size > 0)
    out.push({ label: 'Remove every indoor smoke source', next: { ...room, sources: new Set() } });
  if (room.sources.has('frying') && !room.exhaust)
    out.push({ label: 'Turn the kitchen hood on', next: { ...room, exhaust: true } });
  if (room.purifier === 'none')
    out.push({ label: 'Add a DIY box-fan filter', next: { ...room, purifier: 'diy' } });
  else if (room.purifier === 'small')
    out.push({ label: 'Upgrade to a large purifier', next: { ...room, purifier: 'large' } });
  if (room.ventilation === 'leaky')
    out.push({
      label: 'Draught-proof doors and windows',
      next: { ...room, ventilation: 'normal' },
    });
  return out;
}

/** Each change on its own that lowers indoor PM2.5, best first. */
export function quickWins(room: Room, indoorPm25: number): QuickWin[] {
  return candidateChanges(room)
    .map((c) => ({ ...c, after: simulate(c.next).indoorPm25 }))
    .filter((w) => w.after < indoorPm25 - MIN_GAIN)
    .sort((a, b) => a.after - b.after);
}

/** Percentage cut from `before` to `after`, guarding against a near-zero baseline. */
export function cutPercent(before: number, after: number): number {
  return ((before - after) / Math.max(1, before)) * 100;
}
