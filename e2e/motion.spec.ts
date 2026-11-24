/**
 * The one spec that runs with animations on. Every other spec emulates reduced motion; this one
 * proves the animated paths (paced build log, expanding rows, sliding tab underline, the 3D and
 * canvas views) still reach the same end states, using only web-first assertions.
 */
import { ROUTES, definition, expectRoute, openApp, routineRow, tab } from './support/app';
import { aiPlan, localPlan } from './support/fixtures';
import { expect, test } from './support/test';

const plan = localPlan();
const ai = aiPlan(plan);

test.use({ reducedMotion: 'no-preference' });

test.describe('With motion enabled', () => {
  test('the browser is not asking for reduced motion', async ({ page }) => {
    await openApp(page, '/');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      false,
    );
  });

  test('a deployment paces its build log and finishes', async ({ page, network }) => {
    await openApp(page, '/routine');
    const releasePlan = network.holdPlan();
    const log = page.getByRole('list').filter({ hasText: 'Fetching live air quality' });

    await page.getByRole('button', { name: 'Deploy with Gemini' }).click();

    // Lines arrive one at a time; the log has animated open by the time the last one lands.
    await expect(log).toContainText('Asking Gemini to explain the plan');
    await expect(log.getByRole('listitem')).toHaveCount(6);
    await expect(log.getByRole('listitem').last()).toBeInViewport();
    await expect(definition(page, 'Status')).toHaveText('Building');

    releasePlan();

    await expect(definition(page, 'Status')).toHaveText('Ready');
    await expect(page.getByRole('heading', { name: ai.headline })).toBeVisible();
    // The log collapses again once the build is done.
    await expect(log).toBeHidden();
  });

  test('a routine row animates open and closed', async ({ page }) => {
    await openApp(page, '/routine');
    const [first] = plan.items.filter((item) => item.freeAction);
    if (!first) throw new Error('The fixture plan has no free actions');
    const row = routineRow(page, first.title);
    const detail = page.getByText(first.detail);

    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(detail).toBeVisible();
    await expect(page.getByText('How we worked it out')).toBeVisible();

    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toBeHidden();
  });

  test('tabs still navigate while the underline slides', async ({ page }) => {
    await openApp(page, '/');
    for (const route of [ROUTES[3], ROUTES[6], ROUTES[0]]) {
      await tab(page, route.tab).click();
      await expectRoute(page, route);
    }
  });

  test('the animated views render and the scrubber still responds', async ({ page }) => {
    await openApp(page, '/');
    const slider = page.getByRole('slider', { name: 'Scrub the next 48 hours' });

    await slider.focus();
    await slider.press('End');

    await expect(slider).toHaveValue('47');
    await expect(page.getByText('Tue 23:00 · 170 µg/m³')).toBeVisible();

    await tab(page, 'Indoor lab').click();
    await page.getByRole('switch', { name: 'Windows open' }).click();
    await expect(page.getByRole('switch', { name: 'Windows open' })).toBeChecked();
    await expect(definition(page, 'Indoor PM2.5')).toContainText('µg/m³');
  });
});
