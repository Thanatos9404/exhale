/**
 * Server state for the app: the live air snapshot (one cache entry per place, shared by every
 * reader), the plan and AQI series derived from it, and the server's health.
 */
import { useCallback, useMemo } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchAirSnapshot } from '@/lib/air/openMeteo';
import { aqiSeries, hourlyAqi } from '@/lib/air/aqi';
import type { AirSnapshot, Place } from '@/lib/air/types';
import { buildPlan } from '@/lib/planner/engine';
import { getHealth } from '@/lib/api';
import { useAppState } from '@/state/AppState';

const MINUTE_MS = 60_000;
/** A snapshot is served from the cache for this long before it is refetched. */
const AIR_STALE_MS = 10 * MINUTE_MS;
const AIR_REFRESH_MS = 15 * MINUTE_MS;
/** Health only changes when the server is redeployed, so one check lasts the visit. */
const HEALTH_STALE_MS = 60 * MINUTE_MS;

/**
 * The cache entry for a place's air snapshot. Hooks and imperative callers (a deployment) share
 * it, so the data is fetched once however many of them ask.
 */
export function airQueryOptions(place: Place) {
  return queryOptions({
    queryKey: ['air', place.lat.toFixed(2), place.lon.toFixed(2)] as const,
    queryFn: ({ signal }) => fetchAirSnapshot(place, { signal }),
    staleTime: AIR_STALE_MS,
  });
}

/** The snapshot under the label the user chose; nearby places share one cache entry. */
export function withPlaceLabel(data: AirSnapshot, label: string): AirSnapshot {
  return { ...data, place: { ...data.place, label } };
}

/** Live air snapshot for the selected place. Cached 10 min, refreshed every 15 min while open. */
export function useAir() {
  const { place } = useAppState();
  const { label } = place;
  // A stable selector lets the query reuse its last result instead of rebuilding it per render.
  const select = useCallback((data: AirSnapshot) => withPlaceLabel(data, label), [label]);
  return useQuery({
    ...airQueryOptions(place),
    refetchInterval: AIR_REFRESH_MS,
    refetchOnWindowFocus: false,
    retry: 2,
    select,
  });
}

/** The deterministic plan, recomputed locally whenever the data or the profile changes. */
export function useLocalPlan() {
  const { household } = useAppState();
  const air = useAir();
  const plan = useMemo(
    () => (air.data ? buildPlan(household, air.data) : null),
    [air.data, household],
  );
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

/**
 * Server health: whether an AI provider is configured and which model answers. Pass `false` to
 * hold the request back while nothing on screen shows the answer.
 */
export function useHealth(enabled = true) {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    enabled,
    staleTime: HEALTH_STALE_MS,
    gcTime: HEALTH_STALE_MS,
    retry: 0,
    refetchOnWindowFocus: false,
  });
}
