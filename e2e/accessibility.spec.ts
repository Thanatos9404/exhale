/**
 * Journey 10, Accessibility in a real browser: axe-core finds no violations on any of the seven
 * routes in the dark and the light theme, and the skip link, the tab bar and the theme switch
 * work from the keyboard alone.
 */
import type { Page } from '@playwright/test';
import { ROUTES, commandMenu, expectRoute, openApp, tab, type Theme } from './support/app';
import { axeViolations } from './support/axe';
import { expect, test } from './support/test';

const THEMES: readonly Theme[] = ['dark', 'light'];

/** The colour scheme the browser actually applied to the document. */
const colorScheme = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

test.describe('Accessibility', () => {
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`${route.heading} has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openApp(page, route.path, { theme });
        await expect.poll(() => colorScheme(page)).toBe(theme);

        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test(`the open command menu has no axe violations in the ${theme} theme`, async ({ page }) => {
      await openApp(page, '/', { theme });
      await page.keyboard.press('Control+k');
      await expect(commandMenu(page)).toBeVisible();

      expect(await axeViolations(page)).toEqual([]);
    });

    test(`a deployed routine has no axe violations in the ${theme} theme`, async ({ page }) => {
      await openApp(page, '/routine', { theme });
      await page.getByRole('button', { name: 'Deploy with Gemini' }).click();
      await expect(page.getByText('Written by Gemini from your live data')).toBeVisible();
      // The build log fades out when the run ends; audit once it has gone.
      await expect(
        page.getByRole('list').filter({ hasText: 'Fetching live air quality' }),
      ).toHaveCount(0);

      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('the skip link is the first stop and moves focus to the content', async ({ page }) => {
    await openApp(page, '/');
    const skip = page.getByRole('link', { name: 'Skip to content' });

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

    // The next stop is the first control inside the page, not the header or the tab bar.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('main').locator(':focus')).toBeVisible();
    await expect(page.getByRole('banner').locator(':focus')).toHaveCount(0);
  });

  test('the tab bar works from the keyboard alone', async ({ page }) => {
    await openApp(page, '/');
    await tab(page, 'Overview').focus();

    // Tab moves along the bar in reading order; Enter opens the focused page.
    for (const route of ROUTES.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(tab(page, route.tab)).toBeFocused();
      await page.keyboard.press('Enter');
      await expectRoute(page, route);
      await expect(tab(page, route.tab)).toBeFocused();
    }

    await page.keyboard.press('Shift+Tab');
    await expect(tab(page, 'Assistant')).toBeFocused();
    await page.keyboard.press('Enter');
    await expectRoute(page, ROUTES[5]);
  });

  test('the theme switch works from the keyboard and is remembered', async ({ page }) => {
    await openApp(page, '/');
    const themes = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(themes.getByRole('radio', { name: 'Dark theme' })).toBeChecked();
    await expect.poll(() => colorScheme(page)).toBe('dark');

    await themes.getByRole('radio', { name: 'Light theme' }).focus();
    await page.keyboard.press('Enter');

    await expect(themes.getByRole('radio', { name: 'Light theme' })).toBeChecked();
    await expect.poll(() => colorScheme(page)).toBe('light');

    await page.reload();
    await expect(themes.getByRole('radio', { name: 'Light theme' })).toBeChecked();
    await expect.poll(() => colorScheme(page)).toBe('light');
  });
});
