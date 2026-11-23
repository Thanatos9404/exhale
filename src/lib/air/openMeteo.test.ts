import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSnapshot, openMeteoPayloads } from '@/test/fixtures';
import {
  AIR_URL,
  AirDataError,
  GEOCODE_URL,
  WEATHER_URL,
  buildAirUrl,
  buildWeatherUrl,
  fetchAirSnapshot,
  findNowIndex,
  mergeHourly,
  roundCoord,
  searchPlaces,
} from './openMeteo';
import type { HourPoint } from './types';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;
const asFetch = (f: FetchStub) => f as unknown as typeof fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const place = { lat: 28.6139, lon: 77.209, label: 'New Delhi, India' };

/** A fetch stand-in that answers the air and weather endpoints separately. */
function provider(air: () => Promise<Response>, weather: () => Promise<Response>) {
  return vi.fn<FetchStub>((url) => (url.startsWith(AIR_URL) ? air() : weather()));
}

const ok = (body: unknown) => () => Promise.resolve(json(body));

describe('roundCoord', () => {
  it('rounds to 0.01 degrees in both hemispheres', () => {
    expect(roundCoord(28.6139)).toBe(28.61);
    expect(roundCoord(77.209)).toBe(77.21);
    expect(roundCoord(-33.8688)).toBe(-33.87);
    expect(roundCoord(151)).toBe(151);
  });
});

describe('request URLs', () => {
  it('asks for rounded coordinates, local time and the same five-day window', () => {
    const air = new URL(buildAirUrl(28.6139, 77.209));
    const weather = new URL(buildWeatherUrl(28.6139, 77.209));
    expect(`${air.origin}${air.pathname}`).toBe(AIR_URL);
    expect(`${weather.origin}${weather.pathname}`).toBe(WEATHER_URL);
    for (const url of [air, weather]) {
      expect(url.searchParams.get('latitude')).toBe('28.61');
      expect(url.searchParams.get('longitude')).toBe('77.21');
      expect(url.searchParams.get('timezone')).toBe('auto');
      expect(url.searchParams.get('past_days')).toBe('1');
      expect(url.searchParams.get('forecast_days')).toBe('4');
    }
    expect(air.searchParams.get('hourly')).toBe('pm2_5,pm10,nitrogen_dioxide,ozone');
    expect(weather.searchParams.get('hourly')).toContain('boundary_layer_height');
  });
});

describe('mergeHourly', () => {
  const air = {
    time: ['2026-11-23T00:00', '2026-11-23T01:00', '2026-11-23T02:00'],
    pm2_5: [180, null, 160],
    pm10: [290, 280],
    nitrogen_dioxide: [40, 41, 42],
    ozone: [20, 21, 22],
  };

  it('joins weather to air on matching timestamps, not on position', () => {
    const weather = {
      // Starts an hour later than the air feed, so positions do not line up.
      time: ['2026-11-23T01:00', '2026-11-23T02:00'],
      temperature_2m: [11, 10],
      wind_speed_10m: [3, null],
      boundary_layer_height: [40, 35],
      relative_humidity_2m: [72, 75],
    };
    expect(mergeHourly(air, weather)).toEqual([
      {
        time: '2026-11-23T00:00',
        pm25: 180,
        pm10: 290,
        no2: 40,
        o3: 20,
        temp: null,
        wind: null,
        blh: null,
        rh: null,
      },
      {
        time: '2026-11-23T01:00',
        pm25: null,
        pm10: 280,
        no2: 41,
        o3: 21,
        temp: 11,
        wind: 3,
        blh: 40,
        rh: 72,
      },
      {
        time: '2026-11-23T02:00',
        pm25: 160,
        // The air feed's pm10 array is one short; the gap becomes null, not undefined.
        pm10: null,
        no2: 42,
        o3: 22,
        temp: 10,
        wind: null,
        blh: 35,
        rh: 75,
      },
    ]);
  });

  it('fills weather fields with null when there is no weather feed', () => {
    const merged = mergeHourly(air, null);
    expect(merged.map((h) => h.time)).toEqual(air.time);
    for (const h of merged) {
      expect([h.temp, h.wind, h.blh, h.rh]).toEqual([null, null, null, null]);
    }
  });

  it('turns air values missing from short pollutant arrays into null', () => {
    const short = {
      time: ['2026-11-23T00:00'],
      pm2_5: [],
      pm10: [],
      nitrogen_dioxide: [],
      ozone: [],
    };
    expect(mergeHourly(short, null)).toEqual([
      {
        time: '2026-11-23T00:00',
        pm25: null,
        pm10: null,
        no2: null,
        o3: null,
        temp: null,
        wind: null,
        blh: null,
        rh: null,
      },
    ]);
  });

  it('treats a weather value missing past the end of its array as null', () => {
    const weather = {
      time: ['2026-11-23T00:00'],
      temperature_2m: [],
      wind_speed_10m: [4],
      boundary_layer_height: [50],
      relative_humidity_2m: [70],
    };
    expect(mergeHourly(air, weather)[0]).toMatchObject({ temp: null, wind: 4, blh: 50, rh: 70 });
  });
});

describe('findNowIndex', () => {
  const hourly = ['2026-11-23T00:00', '2026-11-23T01:00', '2026-11-23T03:00'].map(
    (time) => ({ time }) as HourPoint,
  );

  it('finds the hour that contains the current time', () => {
    expect(findNowIndex(hourly, '2026-11-23T01:45')).toBe(1);
    expect(findNowIndex(hourly, '2026-11-23T03:00')).toBe(2);
  });

  it('falls back to the closest earlier hour when the current hour is missing', () => {
    expect(findNowIndex(hourly, '2026-11-23T02:30')).toBe(1);
    expect(findNowIndex(hourly, '2026-11-24T09:00')).toBe(2);
  });

  it('returns the first hour when the current time is before the series or it is empty', () => {
    expect(findNowIndex(hourly, '2026-11-22T23:00')).toBe(0);
    expect(findNowIndex([], '2026-11-23T01:00')).toBe(0);
  });
});

describe('fetchAirSnapshot', () => {
  const payloads = openMeteoPayloads();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('merges air and weather into the snapshot the engine expects', async () => {
    const fetchMock = provider(ok(payloads.air), ok(payloads.weather));
    const snap = await fetchAirSnapshot(
      { lat: 28.61, lon: 77.21, label: 'New Delhi, India' },
      { fetchImpl: asFetch(fetchMock) },
    );
    expect(snap).toEqual(makeSnapshot());
    expect(snap.nowIndex).toBe(24);
  });

  it('requests both feeds as JSON with the caller signal', async () => {
    const fetchMock = provider(ok(payloads.air), ok(payloads.weather));
    const controller = new AbortController();
    await fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock), signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(
      expect.arrayContaining([buildAirUrl(place.lat, place.lon), buildWeatherUrl(28.61, 77.21)]),
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual({ signal: controller.signal, headers: { accept: 'application/json' } });
    }
  });

  it('uses the global fetch when none is injected', async () => {
    const fetchMock = provider(ok(payloads.air), ok(payloads.weather));
    vi.stubGlobal('fetch', fetchMock);
    const snap = await fetchAirSnapshot(place);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap.place).toEqual({ ...place, timezone: 'Asia/Kolkata' });
  });

  it('reports daytime from the weather feed', async () => {
    const weather = structuredClone(payloads.weather);
    weather.current.is_day = 1;
    const fetchMock = provider(ok(payloads.air), ok(weather));
    const snap = await fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock) });
    expect(snap.current.isDay).toBe(true);
  });

  it.each([
    ['responds with an HTTP error', () => Promise.resolve(json({ reason: 'busy' }, 503))],
    ['sends an unexpected shape', () => Promise.resolve(json({ current: { time: 'x' } }))],
    ['is unreachable', () => Promise.reject(new TypeError('fetch failed'))],
  ])('keeps the air data when the weather feed %s', async (_case, weather) => {
    const fetchMock = provider(ok(payloads.air), weather);
    const snap = await fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock) });
    expect(snap.current).toMatchObject({
      pm25: payloads.air.current.pm2_5,
      so2: 10,
      co: 900,
      temp: null,
      rh: null,
      wind: null,
      windDir: null,
      // Without weather the day/night flag cannot be known, so it defaults to day.
      isDay: true,
    });
    expect(snap.hourly).toHaveLength(payloads.air.hourly.time.length);
    expect(snap.hourly.every((h) => h.blh === null && h.temp === null)).toBe(true);
    expect(snap.hourly[30]?.pm25).toBe(payloads.air.hourly.pm2_5[30]);
  });

  it('fails with the HTTP status when the air-quality feed errors', async () => {
    const fetchMock = provider(() => Promise.resolve(json({}, 503)), ok(payloads.weather));
    const err = await fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock) }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AirDataError);
    expect(err).toMatchObject({
      name: 'AirDataError',
      message: 'Data provider responded 503',
      status: 503,
    });
  });

  it('rejects an air-quality response that does not match the schema', async () => {
    const broken = { ...payloads.air, hourly: { ...payloads.air.hourly, pm2_5: ['high'] } };
    const fetchMock = provider(ok(broken), ok(payloads.weather));
    const err = await fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock) }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AirDataError);
    expect(err).toMatchObject({ message: 'Unexpected air-quality response', status: undefined });
  });

  it('rejects when the air-quality body is not JSON', async () => {
    const fetchMock = provider(
      () => Promise.resolve(new Response('<html>gateway</html>')),
      ok(payloads.weather),
    );
    await expect(fetchAirSnapshot(place, { fetchImpl: asFetch(fetchMock) })).rejects.toThrow(
      SyntaxError,
    );
  });

  it('rejects with the abort reason when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<FetchStub>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const pending = fetchAirSnapshot(place, {
      fetchImpl: asFetch(fetchMock),
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('searchPlaces', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const hits = {
    results: [
      {
        id: 1261481,
        name: 'New Delhi',
        latitude: 28.63576,
        longitude: 77.22445,
        country: 'India',
        admin1: 'Delhi',
        timezone: 'Asia/Kolkata',
        population: 317797,
      },
      { id: 42, name: 'Nowhere', latitude: 1.5, longitude: -2.25 },
    ],
  };

  it('returns nothing for queries shorter than two characters without calling the API', async () => {
    const fetchMock = vi.fn<FetchStub>();
    await expect(searchPlaces('  d ', { fetchImpl: asFetch(fetchMock) })).resolves.toEqual([]);
    await expect(searchPlaces('', { fetchImpl: asFetch(fetchMock) })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps hits to places with a region and a label', async () => {
    const fetchMock = vi.fn<FetchStub>(() => Promise.resolve(json(hits)));
    const results = await searchPlaces('delhi', { fetchImpl: asFetch(fetchMock) });
    expect(results).toEqual([
      {
        id: 1261481,
        name: 'New Delhi',
        region: 'Delhi, India',
        lat: 28.63576,
        lon: 77.22445,
        label: 'New Delhi, India',
        timezone: 'Asia/Kolkata',
      },
      { id: 42, name: 'Nowhere', region: '', lat: 1.5, lon: -2.25, label: 'Nowhere' },
    ]);
    // A hit without a zone must not carry an explicit `timezone: undefined`.
    expect(results[1]).not.toHaveProperty('timezone');
  });

  it('trims the query, caps it at 80 characters and asks for eight English results', async () => {
    const fetchMock = vi.fn<FetchStub>(() => Promise.resolve(json(hits)));
    const signal = new AbortController().signal;
    await searchPlaces(`   ${'x'.repeat(100)}   `, { fetchImpl: asFetch(fetchMock), signal });
    const [url, init] = fetchMock.mock.calls[0]!;
    const params = new URL(url).searchParams;
    expect(url.startsWith(`${GEOCODE_URL}?`)).toBe(true);
    expect(params.get('name')).toBe('x'.repeat(80));
    expect(params.get('count')).toBe('8');
    expect(params.get('language')).toBe('en');
    expect(params.get('format')).toBe('json');
    expect(init?.signal).toBe(signal);
  });

  it('returns an empty list when the provider has no results field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchStub>(() => Promise.resolve(json({ generationtime_ms: 1 }))),
    );
    await expect(searchPlaces('Atlantis')).resolves.toEqual([]);
  });

  it('rejects a malformed geocoding response', async () => {
    const fetchMock = vi.fn<FetchStub>(() =>
      Promise.resolve(json({ results: [{ id: '1', name: 'Delhi' }] })),
    );
    await expect(searchPlaces('Delhi', { fetchImpl: asFetch(fetchMock) })).rejects.toThrow(
      new AirDataError('Unexpected geocoding response'),
    );
  });

  it('surfaces the HTTP status of a failed search', async () => {
    const fetchMock = vi.fn<FetchStub>(() => Promise.resolve(json({}, 429)));
    await expect(searchPlaces('Delhi', { fetchImpl: asFetch(fetchMock) })).rejects.toMatchObject({
      name: 'AirDataError',
      status: 429,
    });
  });
});
