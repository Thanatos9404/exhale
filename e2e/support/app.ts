/**
 * Page helpers shared by the specs: the route table, `openApp`, and locators for the parts of the
 * UI that several journeys touch. Everything is found by role, label or visible text.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** Every page of the app as a user sees it: its tab, its h1 and its document title. */
export const ROUTES = [
  {
    path: '/',
    tab: 'Overview',
    heading: 'Overview',
    title: 'Exhale · Air observability for families',
  },
  { path: '/forecast', tab: 'Forecast', heading: 'Forecast', title: 'Forecast · Exhale' },
  { path: '/routine', tab: 'Routine', heading: 'Routine', title: 'Routine · Exhale' },
  { path: '/impact', tab: 'Impact', heading: 'Impact', title: 'Impact · Exhale' },
  { path: '/indoor', tab: 'Indoor lab', heading: 'Indoor lab', title: 'Indoor lab · Exhale' },
  { path: '/assistant', tab: 'Assistant', heading: 'Assistant', title: 'Assistant · Exhale' },
  { path: '/settings', tab: 'Settings', heading: 'Settings', title: 'Settings · Exhale' },
] as const;

/** One entry of `ROUTES`. */
export type AppRoute = (typeof ROUTES)[number];

/** The colour themes the app ships. */
export type Theme = 'dark' | 'light';

interface OpenOptions {
  /** Start in this theme instead of the default dark one, as if the user had picked it before. */
  theme?: Theme;
  /** Wait until no loading placeholder is left on screen. Defaults to true. */
  settled?: boolean;
}

/** Resolves once every loading placeholder (page chunk, live data, 3D view) has gone. */
export async function expectSettled(page: Page): Promise<void> {
  await expect(page.getByText(/^Loading/)).toHaveCount(0);
}

/** Opens the app at `path` and waits for the shell, the page's h1 and, by default, its data. */
export async function openApp(page: Page, path = '/', options: OpenOptions = {}): Promise<void> {
  const { theme, settled = true } = options;
  if (theme) {
    await page.addInitScript((value) => {
      localStorage.setItem('exhale.theme', value);
    }, theme);
  }
  await page.goto(path);
  await expect(primaryNav(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (settled) await expectSettled(page);
}

/** The sticky tab bar. */
export function primaryNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Primary' });
}

/** One tab in the tab bar. */
export function tab(page: Page, name: string): Locator {
  return primaryNav(page).getByRole('link', { name, exact: true });
}

/** Asserts the page for `route` is showing: URL, a single h1, document title and active tab. */
export async function expectRoute(page: Page, route: AppRoute): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === route.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText([route.heading]);
  await expect(page).toHaveTitle(route.title);
  await expectActiveTab(page, route);
}

/** Asserts exactly this tab is marked as the current page, or none when `active` is null. */
export async function expectActiveTab(page: Page, active: AppRoute | null): Promise<void> {
  for (const route of ROUTES) {
    const link = tab(page, route.tab);
    if (route === active) await expect(link).toHaveAttribute('aria-current', 'page');
    else await expect(link).not.toHaveAttribute('aria-current');
  }
}

/**
 * The value shown for a term in a description list, e.g. `definition(page, 'Indoor PM2.5')`.
 * The values carry no accessible name of their own, so they are reached from their `<dt>`.
 */
export function definition(scope: Page | Locator, term: string | RegExp): Locator {
  return scope
    .getByRole('term')
    .filter({ hasText: term })
    .locator('xpath=following-sibling::dd[1]');
}

/** A toast with this text. */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByRole('region', { name: /Notifications/ }).getByText(text);
}

/** The header button that shows the selected place and opens the command menu. */
export function placeButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Location: / });
}

/** The command menu dialog. */
export function commandMenu(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Command menu' });
}

/** The first whole number in a locator's text, with digit grouping removed. */
export async function readNumber(locator: Locator): Promise<number> {
  const text = (await locator.innerText()).replaceAll(',', '');
  const match = /-?\d+(\.\d+)?/.exec(text);
  if (!match) throw new Error(`No number in "${text}"`);
  return Number(match[0]);
}

/**
 * The expandable row for a routine action. On phones the button's name also carries the status
 * and time, so the title is matched at the start of the name.
 */
export function routineRow(scope: Page | Locator, title: string): Locator {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scope.getByRole('button', { name: new RegExp(`^${escaped}`) });
}
