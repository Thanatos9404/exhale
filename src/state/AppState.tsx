import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { DEFAULT_HOUSEHOLD, parseHousehold, type Household } from '@/lib/profile/schema';
import type { Place } from '@/lib/air/types';
import { KEYS, readStored, removeStored, writeStored } from '@/lib/storage';
import { PREFERS_DARK, mediaMatches, mediaQuery } from './media';

/**
 * App-wide state that belongs to the user: the household profile, the selected place and the theme.
 * Everything lives in this browser only; nothing is stored on a server.
 */

/** Where the app starts before the user picks a place. */
export const DEFAULT_PLACE: Place = {
  lat: 28.6139,
  lon: 77.209,
  label: 'New Delhi, India',
  timezone: 'Asia/Kolkata',
};

const placeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  label: z.string().min(1).max(80),
  timezone: z.string().max(64).optional(),
});

/** The colour theme the user chose; `system` follows the OS setting. */
export type ThemePref = 'system' | 'light' | 'dark';

interface AppState {
  household: Household;
  setHousehold: (h: Household) => void;
  resetHousehold: () => void;
  place: Place;
  setPlace: (p: Place) => void;
  recentPlaces: Place[];
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  clearLocalData: () => void;
}

/** Context behind `useAppState`; null outside `AppStateProvider`. */
const Ctx = createContext<AppState | null>(null);

const parsePlace = (raw: unknown): Place | null => {
  const r = placeSchema.safeParse(raw);
  return r.success ? r.data : null;
};
const parseRecent = (raw: unknown): Place[] | null => {
  const r = z.array(placeSchema).max(6).safeParse(raw);
  return r.success ? r.data : null;
};

function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && mediaMatches(PREFERS_DARK));
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

/** Holds the household, place and theme for the whole app and persists them to this browser. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [household, setHouseholdState] = useState<Household>(
    () => readStored(KEYS.household, parseHousehold) ?? DEFAULT_HOUSEHOLD,
  );
  const [place, setPlaceState] = useState<Place>(
    () => readStored(KEYS.place, parsePlace) ?? DEFAULT_PLACE,
  );
  const [recentPlaces, setRecent] = useState<Place[]>(
    () => readStored(`${KEYS.place}.recent`, parseRecent) ?? [],
  );
  const [theme, setThemeState] = useState<ThemePref>(() => {
    try {
      const t = localStorage.getItem(KEYS.theme);
      return t === 'light' || t === 'dark' || t === 'system' ? t : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = mediaQuery(PREFERS_DARK);
    const onChange = () => applyTheme('system');
    mq?.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, [theme]);

  const setHousehold = useCallback((h: Household) => {
    setHouseholdState(h);
    writeStored(KEYS.household, h);
  }, []);

  const resetHousehold = useCallback(() => setHousehold(DEFAULT_HOUSEHOLD), [setHousehold]);

  const setPlace = useCallback((p: Place) => {
    const clean: Place = {
      lat: p.lat,
      lon: p.lon,
      label: p.label.slice(0, 80),
      ...(p.timezone ? { timezone: p.timezone } : {}),
    };
    setPlaceState(clean);
    writeStored(KEYS.place, clean);
    setRecent((prev) => {
      const next = [clean, ...prev.filter((x) => x.label !== clean.label)].slice(0, 6);
      writeStored(`${KEYS.place}.recent`, next);
      return next;
    });
  }, []);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEYS.theme, t);
    } catch {
      /* ignore */
    }
  }, []);

  const clearLocalData = useCallback(() => {
    Object.values(KEYS).forEach(removeStored);
    removeStored(`${KEYS.place}.recent`);
    setHouseholdState(DEFAULT_HOUSEHOLD);
    setPlaceState(DEFAULT_PLACE);
    setRecent([]);
  }, []);

  const value = useMemo(
    () => ({
      household,
      setHousehold,
      resetHousehold,
      place,
      setPlace,
      recentPlaces,
      theme,
      setTheme,
      clearLocalData,
    }),
    [
      household,
      setHousehold,
      resetHousehold,
      place,
      setPlace,
      recentPlaces,
      theme,
      setTheme,
      clearLocalData,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Reads the app-wide state; throws when used outside `AppStateProvider`. */
export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppState must be used inside AppStateProvider');
  return v;
}
