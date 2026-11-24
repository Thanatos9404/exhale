// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAirCache, getAir } from './airCache';
import { AIR_URL, AirDataError } from '../src/lib/air/openMeteo';
import { openMeteoPayloads } from '../src/test/fixtures';

type FetchStub = (url: string, init?: RequestInit) => Promise<Response>;
const asFetch = (f: FetchStub) => f as unknown as typeof fetch;

const payloads = openMeteoPayloads();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A provider that answers every air and weather request successfully. */
const healthyProvider = () =>
  vi.fn<FetchStub>((url) =>
    Promise.resolve(json(url.startsWith(AIR_URL) ? payloads.air : payloads.weather)),
  );

/** Number of air-quality requests a provider has received (each miss also asks for weather). */
const airCalls = (fetchMock: ReturnType<typeof healthyProvider>) =>
  fetchMock.mock.calls.filter(([url]) => url.startsWith(AIR_URL)).length;

const delhi = { lat: 28.6139, lon: 77.209, label: 'New Delhi, India' };
const T0 = Date.parse('2026-11-23T00:00:00Z');
const MINUTE = 60_000;

beforeEach(() => {
  clearAirCache();
});

describe('getAir', () => {
  it('fetches live air and weather on a cold cache', async () => {
    const fetchMock = healthyProvider();
    const snap = await getAir(delhi, asFetch(fetchMock), T0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap.place).toEqual({ ...delhi, timezone: 'Asia/Kolkata' });
    expect(snap.current.pm25).toBe(payloads.air.current.pm2_5);
  });

  it('gives the provider a 10 second timeout signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchMock = healthyProvider();
      await getAir(delhi, asFetch(fetchMock), T0);
      expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
      const signal = fetchMock.mock.calls[0]![1]?.signal;
      expect(signal).toBe(timeout.mock.results[0]?.value);
      expect(signal?.aborted).toBe(false);
    } finally {
      timeout.mockRestore();
    }
  });

  it('serves the same ~1 km cell from cache for ten minutes, with the caller label', async () => {
    const fetchMock = healthyProvider();
    const first = await getAir(delhi, asFetch(fetchMock), T0);
    // 28.6141, 77.2112 rounds to the same 28.61, 77.21 cell.
    const nearby = { lat: 28.6141, lon: 77.2112, label: 'Connaught Place' };
    const cached = await getAir(nearby, asFetch(fetchMock), T0 + 10 * MINUTE - 1);
    expect(airCalls(fetchMock)).toBe(1);
    expect(cached.place.label).toBe('Connaught Place');
    expect(cached.hourly).toEqual(first.hourly);
    // Relabelling copies the snapshot instead of mutating the cached one.
    expect(first.place.label).toBe('New Delhi, India');
  });

  it('refetches once the entry is ten minutes old', async () => {
    const fetchMock = healthyProvider();
    await getAir(delhi, asFetch(fetchMock), T0);
    await getAir(delhi, asFetch(fetchMock), T0 + 10 * MINUTE);
    expect(airCalls(fetchMock)).toBe(2);
    // The refreshed entry starts a new ten-minute window.
    await getAir(delhi, asFetch(fetchMock), T0 + 19 * MINUTE);
    expect(airCalls(fetchMock)).toBe(2);
  });

  it('keeps separate entries for different cells', async () => {
    const fetchMock = healthyProvider();
    await getAir(delhi, asFetch(fetchMock), T0);
    const mumbai = await getAir(
      { lat: 19.076, lon: 72.8777, label: 'Mumbai' },
      asFetch(fetchMock),
      T0,
    );
    expect(airCalls(fetchMock)).toBe(2);
    expect(mumbai.place.label).toBe('Mumbai');
  });

  it('shares one in-flight fetch between concurrent requests', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn<FetchStub>(async (url) => {
      await gate;
      return json(url.startsWith(AIR_URL) ? payloads.air : payloads.weather);
    });
    const a = getAir(delhi, asFetch(fetchMock), T0);
    const b = getAir({ ...delhi, label: 'Home' }, asFetch(fetchMock), T0 + 1);
    release();
    const [first, second] = await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.place.label).toBe('New Delhi, India');
    expect(second.place.label).toBe('Home');
  });

  it('remembers a failure for 30 seconds, so the next requests fail at once without a fetch', async () => {
    const failing = vi.fn<FetchStub>(() => Promise.resolve(json({}, 503)));
    await expect(getAir(delhi, asFetch(failing), T0)).rejects.toThrow(AirDataError);
    const fetchMock = healthyProvider();
    await expect(getAir(delhi, asFetch(fetchMock), T0 + 1)).rejects.toThrow(AirDataError);
    await expect(getAir(delhi, asFetch(fetchMock), T0 + 29_000)).rejects.toThrow(AirDataError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never serves a cached failure after 30 seconds: the provider is asked again', async () => {
    const failing = vi.fn<FetchStub>(() => Promise.resolve(json({}, 503)));
    await expect(getAir(delhi, asFetch(failing), T0)).rejects.toThrow(AirDataError);
    const fetchMock = healthyProvider();
    // One second of slack covers the real time the failed fetch took.
    const snap = await getAir(delhi, asFetch(fetchMock), T0 + 31_000);
    expect(airCalls(fetchMock)).toBe(1);
    expect(snap.place.label).toBe('New Delhi, India');
    // The fresh reading replaced the failure and is cached like any other.
    await getAir(delhi, asFetch(fetchMock), T0 + 32_000);
    expect(airCalls(fetchMock)).toBe(1);
  });

  it('remembers a failure for its own cell only', async () => {
    const failing = vi.fn<FetchStub>(() => Promise.resolve(json({}, 503)));
    await expect(getAir(delhi, asFetch(failing), T0)).rejects.toThrow(AirDataError);
    const fetchMock = healthyProvider();
    const mumbai = await getAir(
      { lat: 19.076, lon: 72.8777, label: 'Mumbai' },
      asFetch(fetchMock),
      T0,
    );
    expect(mumbai.place.label).toBe('Mumbai');
  });

  it('evicts the oldest cell once 500 cells are cached', () => {
    // A provider that never answers keeps the test synchronous and cheap.
    const pending = vi.fn<FetchStub>(() => new Promise<Response>(() => {}));
    const cell = (i: number) => ({ lat: 10, lon: i / 10, label: `Cell ${i}` });
    for (let i = 0; i <= 500; i++) void getAir(cell(i), asFetch(pending), T0);
    expect(pending).toHaveBeenCalledTimes(501 * 2);
    // The newest cell is still cached; the first one was evicted and is fetched again.
    void getAir(cell(500), asFetch(pending), T0);
    expect(pending).toHaveBeenCalledTimes(501 * 2);
    void getAir(cell(0), asFetch(pending), T0);
    expect(pending).toHaveBeenCalledTimes(502 * 2);
  });

  it('starts cold again after clearAirCache', async () => {
    const fetchMock = healthyProvider();
    await getAir(delhi, asFetch(fetchMock), T0);
    clearAirCache();
    await getAir(delhi, asFetch(fetchMock), T0);
    expect(airCalls(fetchMock)).toBe(2);
  });
});
