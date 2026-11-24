/**
 * Journey 5, Impact: switching a change off recomputes the household totals, and "Apply all"
 * brings them back.
 */
import type { Locator, Page } from '@playwright/test';
import { openApp, readNumber } from './support/app';
import { localPlan } from './support/fixtures';
import { expect, test } from './support/test';

const full = localPlan();
const changes = full.items.filter((item) => item.freeAction && item.change !== undefined);

/**
 * The big number under a headline stat. The value has no role or name of its own, so it is
 * reached as the element that follows its visible label.
 */
function stat(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]');
}

test.describe('Impact', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/impact');
  });

  test('switching a change off recomputes the totals', async ({ page }) => {
    const [biggest] = changes;
    if (!biggest) throw new Error('The fixture plan has no changes to switch off');
    const without = localPlan(
      undefined,
      changes.slice(1).map((item) => item.id),
    );
    const total = changes.length;

    const exposure = stat(page, 'Exposure cut');
    const cigarettes = stat(page, 'Cigarettes avoided');
    const applyAll = page.getByRole('button', { name: 'Apply all' });
    await expect(exposure).toHaveText(`${Math.round(full.totals.exposureCutPct)}%`);
    await expect(page.getByText(`${total} of ${total} changes applied`)).toBeVisible();
    await expect(applyAll).toBeDisabled();
    const exposureBefore = await readNumber(exposure);
    const cigarettesBefore = await readNumber(cigarettes);

    const toggle = page.getByRole('switch', { name: `Apply: ${biggest.title}` });
    await expect(toggle).toBeChecked();
    await toggle.click();

    await expect(toggle).not.toBeChecked();
    await expect(page.getByText(`${total - 1} of ${total} changes applied`)).toBeVisible();
    await expect(exposure).toHaveText(`${Math.round(without.totals.exposureCutPct)}%`);
    expect(await readNumber(exposure)).toBeLessThan(exposureBefore);
    expect(await readNumber(cigarettes)).toBeLessThan(cigarettesBefore);

    await applyAll.click();

    await expect(toggle).toBeChecked();
    await expect(exposure).toHaveText(`${Math.round(full.totals.exposureCutPct)}%`);
    await expect(page.getByText(`${total} of ${total} changes applied`)).toBeVisible();
    await expect(applyAll).toBeDisabled();
  });

  test('switching every change off leaves nothing avoided', async ({ page }) => {
    for (const change of changes) {
      await page.getByRole('switch', { name: `Apply: ${change.title}` }).click();
    }

    await expect(page.getByText(`0 of ${changes.length} changes applied`)).toBeVisible();
    await expect(stat(page, 'Exposure cut')).toHaveText('0%');
    await expect(stat(page, 'Dose avoided today')).toHaveText('0 µg');
  });

  test('each change shows the habit, the plan and what it is worth', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Choice diff' })).toBeVisible();
    for (const change of changes) {
      const hunk = page.getByRole('listitem').filter({
        has: page.getByRole('switch', { name: `Apply: ${change.title}` }),
      });
      await expect(hunk).toContainText(`Usual: ${change.change?.before ?? ''}`);
      await expect(hunk).toContainText(`Plan: ${change.change?.after ?? ''}`);
      await expect(hunk).toContainText('of their day');
    }
    await expect(page.getByRole('heading', { name: 'Per person' })).toBeVisible();
    for (const member of full.members) {
      await expect(page.getByText(member.name, { exact: true })).toBeVisible();
    }
  });
});
