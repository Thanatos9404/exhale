/**
 * Journey 6, Indoor lab: adding a purifier lowers the indoor PM2.5 readout and "Reset to my home"
 * restores it. Also covers the other room controls and the one-click quick wins.
 */
import type { Page } from '@playwright/test';
import { definition, openApp, readNumber } from './support/app';
import { expect, test } from './support/test';

const indoor = (page: Page) => definition(page, 'Indoor PM2.5');
const purifier = (page: Page) => page.getByLabel('Air purifier');
const reset = (page: Page) => page.getByRole('button', { name: 'Reset to my home' });

test.describe('Indoor lab', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/indoor');
    // The room starts from the household profile and the live outdoor reading (170 µg/m³).
    await expect(page.getByText('Live reading here: 170 µg/m³')).toBeVisible();
    await expect(page.getByLabel('Outdoor PM2.5: 170 µg/m³')).toHaveValue('170');
    await expect(purifier(page)).toHaveValue('none');
  });

  test('adding a purifier lowers indoor PM2.5 and reset restores it', async ({ page }) => {
    const before = await readNumber(indoor(page));
    expect(before).toBeGreaterThan(0);

    await purifier(page).selectOption({ label: 'Large (500 m³/h)' });

    await expect.poll(() => readNumber(indoor(page))).toBeLessThan(before);
    const withPurifier = await readNumber(indoor(page));
    await expect(page.getByText(/[1-9][\d.]* clean-air changes an hour/)).toBeVisible();

    await reset(page).click();

    await expect(purifier(page)).toHaveValue('none');
    await expect.poll(() => readNumber(indoor(page))).toBe(before);
    expect(withPurifier).toBeLessThan(before);
    await expect(page.getByText('0.0 clean-air changes an hour')).toBeVisible();
  });

  test('a smoke source makes the room worse and open windows flush it', async ({ page }) => {
    const before = await readNumber(indoor(page));

    await page.getByLabel('Cigarette indoors').check();
    await expect.poll(() => readNumber(indoor(page))).toBeGreaterThan(before);
    const smoky = await readNumber(indoor(page));

    // The fixture home already burns incense and a coil, so it is dirtier inside than outside:
    // opening the windows pulls the room towards the outdoor 170 µg/m³.
    const windows = page.getByRole('switch', { name: 'Windows open' });
    await windows.click();
    await expect(windows).toBeChecked();
    await expect.poll(() => readNumber(indoor(page))).toBeLessThan(smoky);
    expect(await readNumber(indoor(page))).toBeGreaterThan(170);

    await reset(page).click();
    await expect(windows).not.toBeChecked();
    await expect(page.getByLabel('Cigarette indoors')).not.toBeChecked();
    await expect.poll(() => readNumber(indoor(page))).toBe(before);
  });

  test('a quick win applies its change in one click', async ({ page }) => {
    const wins = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Apply' }) });
    const diyFilter = wins.filter({ hasText: 'Add a DIY box-fan filter' });
    await expect(diyFilter).toBeVisible();
    const before = await readNumber(indoor(page));

    await diyFilter.getByRole('button', { name: 'Apply' }).click();

    await expect(purifier(page)).toHaveValue('diy');
    await expect.poll(() => readNumber(indoor(page))).toBeLessThan(before);
    await expect(diyFilter).toHaveCount(0);
  });

  test('draught-proofing is a radio group that changes the readout', async ({ page }) => {
    const group = page.getByRole('radiogroup', { name: 'Draught-proofing' });
    await expect(group.getByRole('radio', { name: 'Typical' })).toBeChecked();
    const before = await readNumber(indoor(page));

    await group.getByRole('radio', { name: 'Leaky' }).click();

    await expect(group.getByRole('radio', { name: 'Leaky' })).toBeChecked();
    await expect.poll(() => readNumber(indoor(page))).not.toBe(before);
  });
});
