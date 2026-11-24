/**
 * Journey 9, Resilience: when the air-data request fails the error state appears with a retry
 * control, and retrying recovers once the feed is back. The optional weather feed can fail
 * without taking the dashboard down.
 */
import type { Page } from '@playwright/test';
import { ROUTES, definition, openApp, tab } from './support/app';
import { expect, test } from './support/test';

/** The app retries a failed feed twice with backoff (about three seconds) before giving up. */
const AFTER_RETRIES = { timeout: 20_000 };

const errorCard = (page: Page) =>
  page.getByRole('alert').filter({ hasText: 'Could not load air data' });
const retry = (page: Page) => page.getByRole('button', { name: 'Try again' });
const feedStatus = (page: Page) => page.getByRole('contentinfo').getByRole('status');

test.describe('Resilience', () => {
  test('a failed air feed shows the error state, and retry recovers', async ({ page, network }) => {
    network.airStatus = 503;
    await openApp(page, '/', { settled: false });

    await expect(errorCard(page)).toBeVisible(AFTER_RETRIES);
    await expect(errorCard(page)).toContainText('Data provider responded 503');
    await expect(feedStatus(page)).toHaveText('Air data unavailable');
    await expect(retry(page)).toBeVisible();
    // One first attempt plus two automatic retries, all answered by the failing fixture.
    expect(network.calls.air).toBe(3);

    // Retrying while the feed is still down keeps the error state.
    await retry(page).click();
    await expect.poll(() => network.calls.air, AFTER_RETRIES).toBe(6);
    await expect(errorCard(page)).toBeVisible();

    network.airStatus = 200;
    await retry(page).click();

    await expect(definition(page, 'PM2.5 now')).toHaveText('170 µg/m³');
    await expect(errorCard(page)).toHaveCount(0);
    await expect(feedStatus(page)).toHaveText('Live data feeds normal');
  });

  for (const route of ROUTES.slice(1, 4)) {
    test(`${route.heading} shows the same error state and recovers`, async ({ page, network }) => {
      network.airStatus = 500;
      await openApp(page, route.path, { settled: false });

      await expect(errorCard(page)).toBeVisible(AFTER_RETRIES);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText([route.heading]);

      network.airStatus = 200;
      await retry(page).click();

      await expect(errorCard(page)).toHaveCount(0);
      await expect(feedStatus(page)).toHaveText('Live data feeds normal');
    });
  }

  test('pages that do not need live air keep working during an outage', async ({
    page,
    network,
  }) => {
    network.airStatus = 500;
    await openApp(page, '/settings', { settled: false });

    await expect(page.getByLabel('Household name')).toHaveValue('My household');
    await tab(page, 'Indoor lab').click();
    // The lab falls back to a typical outdoor level until live data arrives.
    await expect(page.getByLabel(/^Outdoor PM2\.5: \d+ µg\/m³$/)).toBeVisible();
    await expect(definition(page, 'Indoor PM2.5')).toContainText('µg/m³');
    await expect(feedStatus(page)).toHaveText('Air data unavailable', AFTER_RETRIES);
  });

  test('a failed weather feed still shows air quality', async ({ page, network }) => {
    network.weatherStatus = 500;
    await openApp(page, '/');

    await expect(definition(page, 'PM2.5 now')).toHaveText('170 µg/m³');
    await expect(definition(page, 'Dispersion')).toHaveText('Unknown');
    await expect(errorCard(page)).toHaveCount(0);
    await expect(feedStatus(page)).toHaveText('Live data feeds normal');
    expect(network.calls.weather).toBe(1);
  });
});
