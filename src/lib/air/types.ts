/** Shared air-data shapes. Pure types, safe to import from the browser and from server functions. */

export interface Place {
  lat: number;
  lon: number;
  /** Human label, e.g. "New Delhi, India". */
  label: string;
  /** IANA zone reported by the data provider, e.g. "Asia/Kolkata". */
  timezone?: string;
}

/** One hour of merged air-quality and weather data. Concentrations in µg/m³. */
export interface HourPoint {
  /** Local wall-clock ISO time without offset, e.g. "2026-11-23T06:00". */
  time: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  /** Air temperature at 2 m, °C. */
  temp: number | null;
  /** Wind speed at 10 m, km/h. */
  wind: number | null;
  /** Planetary boundary layer height, metres. Low values trap pollution near the ground. */
  blh: number | null;
  /** Relative humidity, %. */
  rh: number | null;
}

export interface CurrentConditions {
  time: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  temp: number | null;
  rh: number | null;
  wind: number | null;
  windDir: number | null;
  isDay: boolean;
}

export interface AirSnapshot {
  place: Place;
  /** ISO timestamp of when the data was fetched. */
  fetchedAt: string;
  utcOffsetSeconds: number;
  current: CurrentConditions;
  /** Hourly series covering roughly the past 24 h and the next 72 h. */
  hourly: HourPoint[];
  /** Index into `hourly` of the current hour. */
  nowIndex: number;
}

export type AqiStandard = 'us' | 'in';

export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'o3';
