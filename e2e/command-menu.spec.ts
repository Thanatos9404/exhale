/**
 * Journey 3, Command menu: Ctrl+K opens it, a city search (mocked geocoding) switches the place
 * shown, an empty result says so, Escape closes it, and it can jump to a page, hand a question to
 * the assistant or use the device location (mocked reverse geocoding).
 */
import type { Page } from '@playwright/test';
import { ROUTES, commandMenu, expectRoute, openApp, placeButton, toast } from './support/app';
import { CHAT_ANSWER_TEXT, DEVICE_LOCATION } from './support/fixtures';
import { expect, test } from './support/test';

const search = (page: Page) => commandMenu(page).getByRole('combobox');

async function openWithKeyboard(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  await expect(commandMenu(page)).toBeVisible();
  await expect(search(page)).toBeFocused();
}

test.describe('Command menu', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/');
    await expect(placeButton(page)).toHaveAccessibleName(/^Location: New Delhi, India\./);
  });

  test('Ctrl+K opens it, a city search switches the place shown', async ({ page, network }) => {
    await openWithKeyboard(page);
    await search(page).fill('Mumbai');

    const hit = commandMenu(page).getByRole('option', { name: /^Mumbai/ });
    await expect(hit).toContainText('Maharashtra, India');
    await hit.click();

    await expect(commandMenu(page)).toBeHidden();
    await expect(placeButton(page)).toHaveAccessibleName(/^Location: Mumbai, India\./);
    await expect(placeButton(page)).toContainText('Mumbai, India');
    await expect(toast(page, 'Switched to Mumbai, India')).toBeVisible();
    // The dashboard reloads for the new place: a second air request, answered by the fixture.
    await expect.poll(() => network.calls.air).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('Now · 170 µg/m³')).toBeVisible();

    // The choice survives a reload and is offered again as a recent place.
    await page.reload();
    await expect(placeButton(page)).toHaveAccessibleName(/^Location: Mumbai, India\./);
    await placeButton(page).click();
    await expect(
      commandMenu(page).getByRole('option', { name: /Mumbai, India.*Recent/ }),
    ).toBeVisible();
  });

  test('a city can be picked with the keyboard alone', async ({ page }) => {
    await openWithKeyboard(page);
    await page.keyboard.type('Mum');
    const hit = commandMenu(page).getByRole('option', { name: /^Mumbai/ });
    await expect(hit).toBeVisible();

    // The first option is "Ask Exhale", the second the device location, the third the city.
    const options = commandMenu(page).getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(hit).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    await expect(commandMenu(page)).toBeHidden();
    await expect(placeButton(page)).toHaveAccessibleName(/^Location: Mumbai, India\./);
  });

  test('says when no places match', async ({ page }) => {
    await openWithKeyboard(page);
    await search(page).fill('Zzyzx');

    await expect(commandMenu(page).getByRole('status')).toHaveText(
      'No places match “Zzyzx”. Check the spelling or try a nearby city.',
    );
    await expect(commandMenu(page).getByRole('option', { name: /^Mumbai/ })).toHaveCount(0);
  });

  test('Escape closes it and leaves the place unchanged', async ({ page }) => {
    await openWithKeyboard(page);
    await page.keyboard.press('Escape');

    await expect(commandMenu(page)).toBeHidden();
    await expect(placeButton(page)).toHaveAccessibleName(/^Location: New Delhi, India\./);

    // Ctrl+K toggles: a second press closes what the first opened.
    await openWithKeyboard(page);
    await page.keyboard.press('Control+k');
    await expect(commandMenu(page)).toBeHidden();
  });

  test('jumps to a page', async ({ page }) => {
    await placeButton(page).click();
    await search(page).fill('indoor');
    await commandMenu(page).getByRole('option', { name: 'Indoor lab' }).click();

    await expect(commandMenu(page)).toBeHidden();
    await expectRoute(page, ROUTES[4]);
  });

  test('hands a typed question to the assistant', async ({ page, network }) => {
    await openWithKeyboard(page);
    await search(page).fill('Is it safe to jog at dawn?');
    await commandMenu(page)
      .getByRole('option', { name: /^Ask Exhale: / })
      .click();

    await expectRoute(page, ROUTES[5]);
    const conversation = page.getByRole('log', { name: 'Conversation' });
    await expect(conversation).toContainText('Is it safe to jog at dawn?');
    await expect(conversation).toContainText(CHAT_ANSWER_TEXT);
    expect(network.calls.chat).toBe(1);
  });

  test.describe('with device location allowed', () => {
    test.use({ geolocation: DEVICE_LOCATION, permissions: ['geolocation'] });

    test('"Use my current location" names the spot from reverse geocoding', async ({
      page,
      network,
    }) => {
      await openWithKeyboard(page);
      await commandMenu(page).getByRole('option', { name: 'Use my current location' }).click();

      await expect(toast(page, 'Switched to Jaipur, India')).toBeVisible();
      await expect(placeButton(page)).toHaveAccessibleName(/^Location: Jaipur, India\./);
      expect(network.calls.reverse).toBe(1);
    });
  });
});
