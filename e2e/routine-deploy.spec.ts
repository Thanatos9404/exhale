/**
 * Journey 4, Routine deploy: deploying shows the build log, then the AI summary and per-action
 * explanations from the mocked `/api/plan`. Covers the Gemini, Claude and rules-engine responses
 * and a server error. No real AI provider is ever called: the plan comes from fixtures.
 */
import type { Page } from '@playwright/test';
import { definition, openApp, routineRow } from './support/app';
import { MODELS, aiPlan, localPlan, whyFor } from './support/fixtures';
import { expect, test } from './support/test';

const plan = localPlan();
const ai = aiPlan(plan);
const [first, second] = plan.items.filter((item) => item.freeAction);
if (!first || !second) throw new Error('The fixture plan needs two free actions');

const deployButton = (page: Page) => page.getByRole('button', { name: 'Deploy with Gemini' });
const logs = (page: Page) => page.getByRole('button', { name: /^Build logs/ });
const log = (page: Page) => page.getByRole('list').filter({ hasText: 'Fetching live air quality' });

test.describe('Routine deploy', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, '/routine');
    await expect(definition(page, 'Status')).toHaveText('Not deployed');
    await expect(definition(page, 'Explained by')).toHaveText('Not yet');
    await expect(page.getByText(/^Not deployed yet\./)).toBeVisible();
  });

  test('shows build logs, then the AI summary and per-action explanations', async ({
    page,
    network,
  }) => {
    const releasePlan = network.holdPlan();

    await deployButton(page).click();

    // While the server "thinks", the build is in progress and the log narrates real numbers.
    await expect(definition(page, 'Status')).toHaveText('Building');
    await expect(page.getByRole('button', { name: 'Deploying…' })).toBeDisabled();
    await expect(logs(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(log(page)).toContainText('Fetching live air quality for New Delhi, India');
    await expect(log(page)).toContainText(
      '120 hourly readings. Now PM2.5 170 µg/m³, mixing height 30 m',
    );
    await expect(log(page)).toContainText('Smog lid detected');
    await expect(log(page)).toContainText(
      `Testing ${plan.items.length} changes (commute: car (petrol), 14 km)`,
    );
    await expect(log(page)).toContainText('Asking Gemini to explain the plan');
    await expect(page.getByText(/^Deploying: Gemini is explaining/)).toBeVisible();

    releasePlan();

    await expect(definition(page, 'Status')).toHaveText('Ready');
    await expect(definition(page, 'Explained by')).toHaveText(MODELS.gemini);
    await expect(definition(page, 'Deployed')).toHaveText('just now');
    await expect(page.getByText('Written by Gemini from your live data')).toBeVisible();
    await expect(page.getByRole('heading', { name: ai.headline })).toBeVisible();
    await expect(page.getByText(ai.summary)).toBeVisible();
    await expect(page.getByText(ai.familyNote ?? '')).toBeVisible();

    // Every action now carries the model's explanation, shown when its row is opened.
    await expect(page.getByText(whyFor(second.title), { exact: true })).toBeHidden();
    await routineRow(page, second.title).click();
    await expect(page.getByText(whyFor(second.title), { exact: true })).toBeVisible();
    await expect(page.getByText('Why, for your family (Gemini)').last()).toBeVisible();

    // Tailored tips replace the curated ones, and the run is kept in the history.
    await expect(page.getByText('Fixture hack: seal the bedroom window gaps')).toBeVisible();
    await expect(page.getByText('Fixture swap: metro twice a week')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deployments' })).toBeVisible();
    await expect(page.getByText('Current', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redeploy with Gemini' })).toBeEnabled();
    expect(network.calls.plan).toBe(1);

    // The finished build's log stays available, ending with the provider and the result.
    await expect(logs(page)).toHaveAttribute('aria-expanded', 'false');
    await logs(page).click();
    await expect(log(page)).toContainText(
      `Gemini (${MODELS.gemini}) wrote ${plan.items.length} explanations`,
    );
    await expect(log(page)).toContainText(
      `Ready: dose −${Math.round(plan.totals.exposureCutPct)}%`,
    );
  });

  test('a deployment survives a reload and opens on its top action', async ({ page }) => {
    await deployButton(page).click();
    await expect(page.getByRole('heading', { name: ai.headline })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: ai.headline })).toBeVisible();
    await expect(definition(page, 'Explained by')).toHaveText(MODELS.gemini);
    await expect(routineRow(page, first.title)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(whyFor(first.title), { exact: true })).toBeVisible();
    await expect(page.getByText(whyFor(second.title), { exact: true })).toBeHidden();
  });

  test('a 500 from /api/plan shows the error state', async ({ page, network }) => {
    network.plan = { status: 500, error: 'The planner is unavailable right now' };

    await deployButton(page).click();

    await expect(definition(page, 'Status')).toHaveText('Error');
    await expect(logs(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(log(page).getByRole('img', { name: 'error' })).toBeVisible();
    await expect(log(page)).toContainText('The planner is unavailable right now');
    await expect(definition(page, 'Explained by')).toHaveText('Not yet');
    await expect(page.getByText(/^Written by .* from your live data/)).toHaveCount(0);

    // The local plan is still there, and a retry succeeds once the server recovers.
    await expect(page.getByRole('heading', { name: 'Free actions' })).toBeVisible();
    network.plan = 'gemini';
    await deployButton(page).click();
    await expect(definition(page, 'Status')).toHaveText('Ready');
    await expect(page.getByRole('heading', { name: ai.headline })).toBeVisible();
  });

  test('a rules-engine response shows the fallback notice', async ({ page, network }) => {
    network.plan = 'rules';

    await deployButton(page).click();

    await expect(definition(page, 'Status')).toHaveText('Ready');
    await expect(definition(page, 'Explained by')).toHaveText('Rules engine');
    await expect(
      page.getByText(/^This deployment used the rules engine because the AI providers were busy\./),
    ).toBeVisible();
    await expect(page.getByText(/^Written by .* from your live data/)).toHaveCount(0);
    await expect(page.getByText(/^Why, for your family/)).toHaveCount(0);
    await expect(page.getByText('Curated', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Fixture (hack|swap)/)).toHaveCount(0);

    await logs(page).click();
    await expect(log(page)).toContainText(
      'AI providers unavailable, using the rules engine explanations',
    );
  });

  test('a Claude response credits Claude', async ({ page, network }) => {
    network.plan = 'claude';

    await deployButton(page).click();

    await expect(definition(page, 'Status')).toHaveText('Ready');
    await expect(definition(page, 'Explained by')).toHaveText(MODELS.claude);
    await expect(page.getByText('Written by Claude Haiku from your live data')).toBeVisible();
    await routineRow(page, second.title).click();
    await expect(page.getByText('Why, for your family (Claude Haiku)').last()).toBeVisible();
    await expect(page.getByText(whyFor(second.title), { exact: true })).toBeVisible();
    await expect(page.getByText('Claude Haiku', { exact: true }).first()).toBeVisible();

    await logs(page).click();
    await expect(log(page)).toContainText(`Gemini busy, Claude (${MODELS.claude}) wrote`);
  });
});
