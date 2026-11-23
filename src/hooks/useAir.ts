import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAirSnapshot } from '@/lib/air/openMeteo';
import { aqiSeries, hourlyAqi } from '@/lib/air/aqi';
import { buildPlan } from '@/lib/planner/engine';
import { getHealth } from '@/lib/api';
import { useAppState } from '@/state/AppState';

/** Live air snapshot for the selected place. Cached 10 min, refreshed every 15 min while open. */
export function useAir() {
  const { place } = useAppState();
  return useQuery({
    queryKey: ['air', place.lat.toFixed(2), place.lon.toFixed(2)],
    queryFn: ({ signal }) => fetchAirSnapshot(place, { signal }),
    staleTime: 10 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    select: (data) => ({ ...data, place: { ...data.place, label: place.label } }),
  });
}

/** The deterministic plan, recomputed locally whenever the data or the profile changes. */
export function useLocalPlan() {
  const { household } = useAppState();
  const air = useAir();
  const plan = useMemo(() => (air.data ? buildPlan(household, air.data) : null), [air.data, household]);
  return { ...air, plan };
}

/** AQI per hour, both trailing-average (official) and instant. */
export function useAqiSeries() {
  const { household } = useAppState();
  const air = useAir();
  return useMemo(() => {
    if (!air.data) return null;
    return {
      official: aqiSeries(air.data.hourly, household.standard),
      instant: air.data.hourly.map((h) => hourlyAqi(h, household.standard)),
    };
  }, [air.data, household.standard]);
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    staleTime: 5 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}
