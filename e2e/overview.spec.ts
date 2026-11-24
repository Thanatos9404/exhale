/**
 * Journey 1, Overview: the live AQI, the smog-lid headline and the routine preview all render
 * from the fixture feeds, and scrubbing the hour slider changes the readout.
 */
import { definition, openApp, routineRow } from './support/app';
import { SNAPSHOT, localPlan } from './support/fixtures';
import { expect, test } from './support/test';

const plan = localPlan();

test.describe('Overview', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/');
  });

  test('shows the live AQI and the readings behind it', async ({ page }) => {
    const aqi = definition(page, /^Air quality index · India NAQI$/);
    await expect(aqi).toContainText(String(plan.risk.aqi));
    await expect(aqi).toContainText(plan.risk.label);

    // The fixture's current hour: PM2.5 170 µg/m³ under a 30 m boundary layer with 3 km/h wind.
    expect(SNAPSHOT.current.pm25).toBe(170);
    await expect(definition(page, 'PM2.5 now')).toHaveText('170 µg/m³');
    await expect(definition(page, 'Mixing height')).toHaveText('30 m');
    await expect(page.getByText('Wind 3.0 km/h')).toBeVisible();
    await expect(definition(page, 'Source')).toHaveText('Open-Meteo · CAMS');
    await expect(page.getByText('Updated just now')).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Live data feeds normal' }),
    ).toBeVisible();
  });

  test('leads with the smog-lid headline', async ({ page }) => {
    expect(plan.headline).toMatch(/^Smog lid \d\d:00 to \d\d:00: air can only mix 30 m high\./);
    await expect(page.getByText(plan.headline)).toBeVisible();
    // The hour strip marks the hours under the lid, starting with the current one.
    const strip = page.getByRole('group', { name: /^Next 24 hours by air quality/ });
    await expect(strip.getByRole('button', { name: /, smog lid$/ }).first()).toHaveAccessibleName(
      '00:00, PM2.5 170, smog lid',
    );
    await expect(
      page.getByText(`Smog lid for ${plan.lid.stagnantHours} of the next 24 h`),
    ).toBeVisible();
  });

  test('previews the top of today’s routine', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Today’s routine' })).toBeVisible();
    await expect(page.getByText(/Live from the planning engine/)).toBeVisible();
    for (const item of plan.items.slice(0, 5)) {
      await expect(routineRow(page, item.title)).toBeVisible();
    }

    const [first] = plan.items;
    if (!first) throw new Error('The fixture plan has no actions');
    const row = routineRow(page, first.title);
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(first.detail)).toBeVisible();

    await page.getByRole('link', { name: `View all ${plan.items.length}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Routine' })).toBeVisible();
  });

  test('scrubbing the hour slider changes the readout', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Scrub the next 48 hours' });
    await expect(slider).toHaveAttribute('aria-valuetext', /^Now: PM2\.5 170 micrograms/);
    await expect(page.getByText('Now · 170 µg/m³')).toBeVisible();

    // Thirteen hours ahead is 13:00, the cleanest fixture hour: PM2.5 70 under a 1,200 m layer.
    await slider.focus();
    for (let hour = 0; hour < 13; hour += 1) await slider.press('ArrowRight');

    await expect(slider).toHaveValue('13');
    await expect(slider).toHaveAttribute(
      'aria-valuetext',
      'Mon 13:00: PM2.5 70 micrograms per cubic metre, mixing height 1,200 metres',
    );
    await expect(page.getByText('Mon 13:00 · 70 µg/m³')).toBeVisible();
    await expect(page.getByText(/^At Mon 13:00: .* PM2\.5 70 µg\/m³\.$/)).toBeVisible();

    // The hour strip is a second way to scrub: picking the first cell returns to now.
    await page.getByRole('button', { name: '00:00, PM2.5 170, smog lid' }).first().click();
    await expect(slider).toHaveValue('0');
    await expect(page.getByText('Now · 170 µg/m³')).toBeVisible();
  });
});
