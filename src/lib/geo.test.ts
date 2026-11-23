import { afterEach, describe, expect, it, vi } from 'vitest';
import { locateUser } from './geo';

function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });
}

function position(latitude: number, longitude: number): GeolocationPosition {
  const coords = {
    latitude,
    longitude,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  };
  return { coords, timestamp: 0, toJSON: () => ({}) };
}

describe('locateUser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rounds the position and falls back from an empty city to the locality', async () => {
    stubGeolocation((ok) => {
      ok(position(28.6139, 77.209));
    });
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ city: '', locality: 'Saket', countryName: 'India' })),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(locateUser()).resolves.toEqual({ lat: 28.61, lon: 77.21, label: 'Saket, India' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps a coordinate label when naming fails', async () => {
    stubGeolocation((ok) => {
      ok(position(28.6139, 77.209));
    });
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    await expect(locateUser()).resolves.toMatchObject({ label: 'Near 28.61, 77.21' });
  });

  it('explains a denied permission', async () => {
    stubGeolocation((_ok, fail) => {
      fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' });
    });
    await expect(locateUser()).rejects.toThrow('Location permission was denied');
  });
});
