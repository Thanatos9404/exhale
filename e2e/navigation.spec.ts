/**
 * Journey 2, Navigation: every tab reaches its page with exactly one h1 and the right document
 * title, deep links and the browser's back and forward buttons work, and an unknown route shows
 * the not-found state with a way home.
 */
import { ROUTES, expectActiveTab, expectRoute, openApp, tab } from './support/app';
import { expect, test } from './support/test';

const [overview, forecast, routine] = ROUTES;

test.describe('Navigation', () => {
  test('every tab reaches its page with one h1 and the right title', async ({ page }) => {
    await openApp(page, '/');
    await expectRoute(page, overview);

    // Walk the tab bar left to right, then come back to the first tab.
    for (const route of [...ROUTES.slice(1), overview]) {
      await tab(page, route.tab).click();
      await expectRoute(page, route);
    }
  });

  for (const route of ROUTES) {
    test(`a direct link to ${route.path} opens ${route.heading}`, async ({ page }) => {
      await openApp(page, route.path);
      await expectRoute(page, route);
    });
  }

  test('the browser’s back and forward buttons follow the tab history', async ({ page }) => {
    await openApp(page, '/');
    await tab(page, forecast.tab).click();
    await expectRoute(page, forecast);
    await tab(page, routine.tab).click();
    await expectRoute(page, routine);

    await page.goBack();
    await expectRoute(page, forecast);
    await page.goBack();
    await expectRoute(page, overview);
    await page.goForward();
    await expectRoute(page, forecast);
  });

  test('in-page links move between pages', async ({ page }) => {
    await openApp(page, '/');
    await page.getByRole('link', { name: 'View forecast' }).click();
    await expectRoute(page, forecast);

    await page.getByRole('link', { name: 'Exhale overview' }).click();
    await expectRoute(page, overview);
  });

  test('an unknown route shows the not-found state and a way home', async ({ page }) => {
    await openApp(page, '/no-such-page');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Page not found']);
    await expect(page.getByText('Nothing here')).toBeVisible();
    await expect(page.getByText(/That page does not exist/)).toBeVisible();
    await expectActiveTab(page, null);

    await page.getByRole('link', { name: 'Go to overview' }).click();
    await expectRoute(page, overview);
  });
});
