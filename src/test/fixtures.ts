import type { AirSnapshot, HourPoint } from '@/lib/air/types';

/**
 * A synthetic winter day shaped like Delhi in November: a night-time inversion
 * (boundary layer ~30 m, calm wind, PM2.5 near 200) that breaks up by early afternoon
 * (boundary layer ~1200 m, PM2.5 near 70) and closes again after sunset.
 */
export function winterPm25(hod: number): number {
  if (hod >= 13 && hod <= 15) return 70;
  if (hod >= 11 && hod <= 17) return 100;
  if (hod >= 6 && hod <= 9) return 210;
  return 170;
}

export function winterBlh(hod: number): number {
  if (hod >= 12 && hod <= 16) return 1200;
  if (hod >= 10 && hod <= 18) return 500;
  return 30;
}

export function makeHourly(
  days = 5,
  startDate = '2026-11-22',
  pm = winterPm25,
  blh = winterBlh,
): HourPoint[] {
  const out: HourPoint[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days * 24; i++) {
    const d = new Date(start.getTime() + i * 3_600_000);
    const time = d.toISOString().slice(0, 16);
    const hod = d.getUTCHours();
    out.push({
      time,
      pm25: pm(hod),
      pm10: pm(hod) * 1.6,
      no2: 40,
      o3: hod >= 11 && hod <= 16 ? 80 : 20,
      temp: hod >= 12 && hod <= 16 ? 24 : 12,
      wind: hod >= 11 && hod <= 17 ? 11 : 3,
      blh: blh(hod),
      rh: 70,
    });
  }
  return out;
}

/** Snapshot whose "now" is 00:00 on the second day, so 24 h of history exist for averages. */
export function makeSnapshot(overrides: Partial<AirSnapshot> = {}): AirSnapshot {
  const hourly = makeHourly();
  const nowIndex = 24;
  return {
    place: { lat: 28.61, lon: 77.21, label: 'New Delhi, India', timezone: 'Asia/Kolkata' },
    fetchedAt: '2026-11-23T00:00:00.000Z',
    utcOffsetSeconds: 19_800,
    current: {
      time: hourly[nowIndex]!.time,
      pm25: hourly[nowIndex]!.pm25,
      pm10: hourly[nowIndex]!.pm10,
      no2: 40,
      o3: 20,
      so2: 10,
      co: 900,
      temp: 12,
      rh: 70,
      wind: 3,
      windDir: 290,
      isDay: false,
    },
    hourly,
    nowIndex,
    ...overrides,
  };
}

/**
 * The raw Open-Meteo air-quality and forecast responses that `fetchAirSnapshot` merges back into
 * `snap` (apart from `fetchedAt`, which is the fetch time). Lets client and cache tests round-trip.
 */
export function openMeteoPayloads(snap: AirSnapshot = makeSnapshot()) {
  const { current: c, hourly: h } = snap;
  const time = h.map((p) => p.time);
  const col = (pick: (p: HourPoint) => number | null) => h.map(pick);
  return {
    air: {
      utc_offset_seconds: snap.utcOffsetSeconds,
      timezone: snap.place.timezone ?? 'GMT',
      current: {
        time: c.time,
        pm2_5: c.pm25,
        pm10: c.pm10,
        nitrogen_dioxide: c.no2,
        ozone: c.o3,
        sulphur_dioxide: c.so2,
        carbon_monoxide: c.co,
      },
      hourly: {
        time,
        pm2_5: col((p) => p.pm25),
        pm10: col((p) => p.pm10),
        nitrogen_dioxide: col((p) => p.no2),
        ozone: col((p) => p.o3),
      },
    },
    weather: {
      current: {
        time: c.time,
        temperature_2m: c.temp,
        relative_humidity_2m: c.rh,
        wind_speed_10m: c.wind,
        wind_direction_10m: c.windDir,
        is_day: c.isDay ? 1 : 0,
      },
      hourly: {
        time,
        temperature_2m: col((p) => p.temp),
        wind_speed_10m: col((p) => p.wind),
        boundary_layer_height: col((p) => p.blh),
        relative_humidity_2m: col((p) => p.rh),
      },
    },
  };
}
