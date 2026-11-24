/**
 * Journey 11, Responsive: on the phone project no route scrolls horizontally, and the primary
 * action of each page is on screen, reachable by touch and does its job when tapped.
 */
import type { Locator, Page } from '@playwright/test';
import { ROUTES, definition, openApp, type AppRoute } from './support/app';
import { CHAT_ANSWER_TEXT } from './support/fixtures';
import { expect, test } from './support/test';

interface PrimaryAction {
  /** The control a phone user reaches for first on this page. */
  control: (page: Page) => Locator;
  /** Anything the control needs before it can be used. */
  prepare?: (page: Page) => Promise<void>;
  /** What tapping it must visibly do. */
  outcome: (page: Page) => Promise<void>;
}

const PRIMARY: Record<AppRoute['path'], PrimaryAction> = {
  '/': {
    control: (page) => page.getByRole('button', { name: 'Deploy today’s routine' }),
    outcome: (page) =>
      expect(page.getByRole('heading', { level: 1, name: 'Routine' })).toBeVisible(),
  },
  '/forecast': {
    control: (page) => page.getByRole('radio', { name: '72h' }),
    outcome: (page) => expect(page.getByRole('radio', { name: '72h' })).toBeChecked(),
  },
  '/routine': {
    control: (page) => page.getByRole('button', { name: 'Deploy with Gemini' }),
    outcome: (page) => expect(definition(page, 'Status')).toHaveText('Ready'),
  },
  '/impact': {
    control: (page) => page.getByRole('switch', { name: /^Apply: / }).first(),
    outcome: (page) => expect(page.getByRole('button', { name: 'Apply all' })).toBeEnabled(),
  },
  '/indoor': {
    control: (page) => page.getByRole('button', { name: 'Reset to my home' }),
    prepare: (page) => page.getByRole('switch', { name: 'Windows open' }).tap(),
    outcome: (page) => expect(page.getByRole('switch', { name: 'Windows open' })).not.toBeChecked(),
  },
  '/assistant': {
    control: (page) => page.getByRole('button', { name: 'Send question' }),
    prepare: (page) =>
      page.getByRole('textbox', { name: 'Ask Exhale' }).fill('Is it safe outside?'),
    outcome: (page) =>
      expect(page.getByRole('log', { name: 'Conversation' })).toContainText(CHAT_ANSWER_TEXT),
  },
  '/settings': {
    control: (page) => page.getByRole('button', { name: 'Add person' }),
    outcome: (page) => expect(page.getByText('4 of 8 people')).toBeVisible(),
  },
};

/** How far the page can scroll sideways, in CSS pixels. Zero means it fits the screen. */
const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe('Responsive (phone)', () => {
  test.skip(({ isMobile }) => !isMobile, 'These checks are for the phone-sized project');

  for (const route of ROUTES) {
    test(`${route.heading} fits the screen without horizontal scrolling`, async ({ page }) => {
      await openApp(page, route.path);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

      // Still true at the bottom of the page, where wide tables and footers usually break out.
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    });

    test(`${route.heading}: the primary action is visible and tappable`, async ({ page }) => {
      const action = PRIMARY[route.path];
      await openApp(page, route.path);
      await action.prepare?.(page);
      const control = action.control(page);

      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
      await expect(control).toBeInViewport({ ratio: 1 });

      await control.tap();
      await action.outcome(page);
    });
  }

  test('the tab bar scrolls sideways inside itself, not the page', async ({ page }) => {
    await openApp(page, '/');
    const settings = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
      name: 'Settings',
    });

    await expect(settings).not.toBeInViewport();
    await settings.tap();

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(settings).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
