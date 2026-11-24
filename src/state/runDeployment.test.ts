import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { airQueryOptions } from '@/hooks/useAir';
import { fetchAirSnapshot } from '@/lib/air/openMeteo';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import type * as OpenMeteo from '@/lib/air/openMeteo';
import type * as Api from '@/lib/api';
import { runDeployment } from './runDeployment';

vi.mock('@/lib/air/openMeteo', async (orig) => ({
  ...(await orig<typeof OpenMeteo>()),
  fetchAirSnapshot: vi.fn(async () => makeSnapshot()),
}));

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof Api>()),
  requestPlan: vi.fn(async () => ({
    plan: buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot()),
    ai: null,
    source: 'rules',
    model: null,
  })),
}));

const place = makeSnapshot().place;

function deploy(queryClient: QueryClient) {
  const lines: string[] = [];
  const log = (_kind: string, text: string) => void lines.push(text);
  const done = runDeployment({ place, household: DEFAULT_HOUSEHOLD, log, pace: 0, queryClient });
  return { done, lines };
}

beforeEach(() => vi.mocked(fetchAirSnapshot).mockClear());

describe('runDeployment air data', () => {
  it('reuses the snapshot the pages already fetched instead of fetching it again', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(airQueryOptions(place).queryKey, makeSnapshot());

    const { done, lines } = deploy(queryClient);
    const deployment = await done;

    expect(fetchAirSnapshot).not.toHaveBeenCalled();
    expect(deployment.placeLabel).toBe(place.label);
    expect(lines.some((line) => line.includes('hourly readings. Now PM2.5 170'))).toBe(true);
  });

  it('fetches again once the cached snapshot has gone stale', async () => {
    const queryClient = new QueryClient();
    const hourAgo = Date.now() - 60 * 60_000;
    queryClient.setQueryData(airQueryOptions(place).queryKey, makeSnapshot(), {
      updatedAt: hourAgo,
    });

    await deploy(queryClient).done;
    expect(fetchAirSnapshot).toHaveBeenCalledOnce();
  });

  it('fetches once when the cache is empty, and leaves the result there for the pages', async () => {
    const queryClient = new QueryClient();

    await deploy(queryClient).done;
    expect(fetchAirSnapshot).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(airQueryOptions(place).queryKey)).toBeDefined();

    await deploy(queryClient).done;
    expect(fetchAirSnapshot).toHaveBeenCalledOnce();
  });

  it('shares one request between a page that is loading and a deployment', async () => {
    const queryClient = new QueryClient();
    const page = queryClient.query(airQueryOptions(place));
    await Promise.all([page, deploy(queryClient).done]);
    expect(fetchAirSnapshot).toHaveBeenCalledOnce();
  });
});
