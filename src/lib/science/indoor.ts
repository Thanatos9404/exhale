/**
 * Single-zone, steady-state indoor PM2.5 mass balance:
 *
 *   C_in = (P · a · C_out + S / V) / (a + k + CADR / V)
 *
 *   P    penetration factor (fraction of outdoor particles that make it through the envelope)
 *   a    air exchange rate with outdoors, 1/h
 *   k    deposition rate of PM2.5 on indoor surfaces, 1/h
 *   CADR clean air delivery rate of a purifier, m³/h
 *   S    indoor emission rate, µg/h
 *   V    room volume, m³
 *
 * Source strengths are order-of-magnitude values from the indoor-air literature and are labelled
 * as approximations in the UI and README.
 */

export type Ventilation = 'sealed' | 'normal' | 'leaky';
export type Purifier = 'none' | 'small' | 'medium' | 'large' | 'diy';

/** Air changes per hour with windows shut. */
export const AIR_EXCHANGE: Record<Ventilation, number> = { sealed: 0.3, normal: 0.7, leaky: 1.5 };
/** Air changes per hour with windows wide open. */
export const WINDOWS_OPEN_ACH = 6;
export const DEPOSITION_RATE = 0.2;
export const PENETRATION_CLOSED = 0.8;
export const PENETRATION_OPEN = 1;
export const CEILING_HEIGHT_M = 2.8;

/** m³/h. "diy" is a box fan with four MERV-13 filters (Corsi-Rosenthal box), conservatively rated. */
export const PURIFIER_CADR: Record<Purifier, number> = {
  none: 0,
  small: 150,
  medium: 300,
  large: 500,
  diy: 550,
};

/** Approximate PM2.5 emission while active, µg/h. */
export const SOURCE_RATE = {
  fryingGas: 30_000,
  biomassStove: 80_000,
  incense: 25_000,
  mosquitoCoil: 12_000,
  cigarette: 15_000,
  candle: 1_000,
} as const;

/** Share of cooking emissions a working kitchen hood removes at source. */
export const EXHAUST_CAPTURE = 0.6;

export interface RoomInput {
  outdoorPm25: number;
  /** Floor area in m². */
  areaM2: number;
  ventilation: Ventilation;
  windowsOpen: boolean;
  purifier: Purifier;
  /** Total indoor emissions while the hour runs, µg/h. */
  sourceUgPerHour?: number;
}

export interface RoomResult {
  indoorPm25: number;
  /** Indoor/outdoor ratio. Above 1 means the home is dirtier than the street. */
  ratio: number;
  /** Minutes for the room to cover ~63% of the way to its new steady state. */
  timeConstantMin: number;
  /** Clean-air changes per hour delivered by the purifier alone. */
  purifierAch: number;
  volumeM3: number;
}

export function simulateRoom(input: RoomInput): RoomResult {
  const volume = Math.max(5, input.areaM2) * CEILING_HEIGHT_M;
  const a = input.windowsOpen ? WINDOWS_OPEN_ACH : AIR_EXCHANGE[input.ventilation];
  const p = input.windowsOpen ? PENETRATION_OPEN : PENETRATION_CLOSED;
  const cadrAch = PURIFIER_CADR[input.purifier] / volume;
  const loss = a + DEPOSITION_RATE + cadrAch;
  const source = Math.max(0, input.sourceUgPerHour ?? 0);
  const outdoor = Math.max(0, input.outdoorPm25);
  const indoor = (p * a * outdoor + source / volume) / loss;
  return {
    indoorPm25: indoor,
    ratio: outdoor > 0 ? indoor / outdoor : 0,
    timeConstantMin: 60 / loss,
    purifierAch: cadrAch,
    volumeM3: volume,
  };
}

/** Indoor/outdoor ratio from infiltration alone (no indoor sources), windows shut. */
export function infiltrationRatio(
  ventilation: Ventilation,
  purifier: Purifier,
  areaM2: number,
): number {
  return simulateRoom({ outdoorPm25: 100, areaM2, ventilation, windowsOpen: false, purifier })
    .ratio;
}

/** Extra µg/m³ an indoor source adds on top of infiltration, for the given room. */
export function sourceIncrement(
  sourceUgPerHour: number,
  ventilation: Ventilation,
  purifier: Purifier,
  areaM2: number,
): number {
  return simulateRoom({
    outdoorPm25: 0,
    areaM2,
    ventilation,
    windowsOpen: false,
    purifier,
    sourceUgPerHour,
  }).indoorPm25;
}
