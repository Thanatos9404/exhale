/**
 * Journey 8, Settings: a saved household name persists across a reload (local storage), an
 * invalid field shows an inline error and blocks saving, and people can be added and removed.
 */
import type { Locator, Page } from '@playwright/test';
import { openApp, toast } from './support/app';
import { expect, test } from './support/test';

const SAVED = 'Household saved. Your plan has been recalculated.';

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const save = (region: Locator) => region.getByRole('button', { name: 'Save' });
const householdName = (page: Page) => page.getByLabel('Household name');
const person = (page: Page, n: number) =>
  section(page, 'People')
    .getByRole('listitem')
    .filter({ hasText: `Person ${n}` });

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/settings');
    await expect(householdName(page)).toHaveValue('My household');
  });

  test('a saved household name persists across a reload', async ({ page, isMobile }) => {
    const general = section(page, 'General');
    await expect(save(general)).toBeDisabled();

    await householdName(page).fill('Thanvi family');
    await expect(save(general)).toBeEnabled();
    await save(general).click();

    await expect(toast(page, SAVED)).toBeVisible();
    await expect(save(general)).toBeDisabled();

    await page.reload();
    await expect(householdName(page)).toHaveValue('Thanvi family');
    await expect(save(section(page, 'General'))).toBeDisabled();
    // The header shows the household on wider screens; phones drop it to save room.
    if (!isMobile) {
      await expect(
        page.getByRole('banner').getByRole('link', { name: /Thanvi family/ }),
      ).toBeVisible();
    }
  });

  test('an invalid name shows an inline error and blocks saving', async ({ page }) => {
    const general = section(page, 'General');
    await householdName(page).fill('<script>alert(1)</script>');

    await expect(householdName(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(general.getByRole('alert')).toHaveText(
      'Use letters, numbers and basic punctuation only',
    );
    await expect(householdName(page)).toHaveAccessibleDescription(
      'Use letters, numbers and basic punctuation only',
    );

    await save(general).click();
    await expect(toast(page, 'Fix the highlighted fields first')).toBeVisible();
    await expect(toast(page, SAVED)).toHaveCount(0);

    // Nothing was stored: a reload brings back the last saved name.
    await page.reload();
    await expect(householdName(page)).toHaveValue('My household');
  });

  test('an empty person name is flagged on that person', async ({ page }) => {
    const first = person(page, 1);
    await first.getByLabel('Name').fill('');

    await expect(first.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
    await expect(first.getByRole('alert')).toBeVisible();
    await expect(person(page, 2).getByRole('alert')).toHaveCount(0);

    await save(section(page, 'People')).click();
    await expect(toast(page, 'Fix the highlighted fields first')).toBeVisible();
  });

  test('a person can be added and removed', async ({ page }) => {
    const people = section(page, 'People');
    await expect(people.getByText('3 of 8 people')).toBeVisible();

    await people.getByRole('button', { name: 'Add person' }).click();
    await expect(people.getByText('4 of 8 people')).toBeVisible();
    await expect(person(page, 4).getByLabel('Name')).toHaveValue('Person 4');
    await person(page, 4).getByLabel('Name').fill('Dadi');
    await person(page, 4).getByLabel('Age group').selectOption({ label: 'Senior (60+)' });
    await save(people).click();
    await expect(toast(page, SAVED)).toBeVisible();

    await page.reload();
    await expect(section(page, 'People').getByText('4 of 8 people')).toBeVisible();
    await expect(person(page, 4).getByLabel('Name')).toHaveValue('Dadi');
    // The new person can now be chosen as the commuter.
    await expect(
      page.getByLabel('Who commutes').getByRole('option', { name: 'Dadi' }),
    ).toBeAttached();

    await page.getByRole('button', { name: 'Remove Dadi' }).click();
    await expect(section(page, 'People').getByText('3 of 8 people')).toBeVisible();
    await expect(person(page, 4)).toHaveCount(0);
    await save(section(page, 'People')).click();

    await page.reload();
    await expect(section(page, 'People').getByText('3 of 8 people')).toBeVisible();
    await expect(page.getByLabel('Who commutes').getByRole('option', { name: 'Dadi' })).toHaveCount(
      0,
    );
  });

  test('the sample household can be restored', async ({ page }) => {
    await householdName(page).fill('Temporary name');
    await save(section(page, 'General')).click();
    await expect(toast(page, SAVED)).toBeVisible();

    await page.getByRole('button', { name: 'Restore sample household' }).click();

    await expect(toast(page, 'Sample household restored')).toBeVisible();
    await expect(householdName(page)).toHaveValue('My household');
  });
});
