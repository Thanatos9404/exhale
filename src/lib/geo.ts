import type { Place } from './air/types';
import { roundCoord } from './air/openMeteo';

const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/**
 * Browser geolocation, rounded to ~1 km before it is used anywhere, then named with a
 * keyless reverse-geocoding lookup. Falls back to a coordinate label if naming fails.
 */
export function locateUser(timeoutMs = 10_000): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = roundCoord(pos.coords.latitude);
        const lon = roundCoord(pos.coords.longitude);
        let label = `Near ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        try {
          const p = new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' });
          const res = await fetch(`${REVERSE_URL}?${p.toString()}`, { signal: AbortSignal.timeout(5_000) });
          if (res.ok) {
            const j = (await res.json()) as { city?: string; locality?: string; countryName?: string };
            const name = j.city || j.locality;
            if (name) label = [name, j.countryName].filter(Boolean).join(', ');
          }
        } catch {
          /* keep coordinate label */
        }
        resolve({ lat, lon, label: label.slice(0, 80) });
      },
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied' : 'Could not get your location')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}
