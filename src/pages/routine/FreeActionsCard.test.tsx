import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as OpenMeteo from '@/lib/air/openMeteo';
import type { PlanResponse } from '@/lib/apiTypes';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations, renderApp } from '@/test/render';
import Routine from '../Routine';

vi.mock('@/lib/air/openMeteo', async (orig) => {
  const actual = await orig<typeof OpenMeteo>();
  return {
    ...actual,
    fetchAirSnapshot: vi.fn(async () => makeSnapshot()),
    searchPlaces: vi.fn(async () => []),
  };
});

// The app scrolls to the top on navigation; jsdom only logs "not implemented".
window.scrollTo = () => {};

const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot());
const free = plan.items.filter((item) => item.freeAction);
const whyFor = (id: string) => `Explained for this family: ${id}.`;

/** What the server answers once Gemini has explained every action. */
const explained: PlanResponse = {
  plan,
  ai: {
    headline: 'A lid until mid-morning, then a clean window.',
    summary: 'Air the house after lunch and keep the morning indoors.',
    items: plan.items.map((item) => ({ id: item.id, why: whyFor(item.id) })),
    indoorHacks: [{ title: 'Wet-mop the floors', detail: 'Dust stays down.', impact: 'Less dust' }],
    sustainableSwaps: [{ title: 'Take the metro', detail: 'Cleaner cabin.', impact: 'Less CO2e' }],
  },
  source: 'gemini',
  model: 'gemini-test',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

// The deploy and the health check never leave the test.
vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    return json(url.includes('/api/plan') ? explained : { ok: true, ai: true, model: null });
  }),
);

/** The button that expands the routine row of one action. */
function rowToggle(id: string): HTMLElement {
  const toggle = screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-controls') === `row-${id}`);
  expect(toggle).toBeDefined();
  return toggle!;
}

describe('FreeActionsCard after a deploy that completes in place', () => {
  it('opens the top action with its new explanation, without a reload', async () => {
    const user = userEvent.setup();
    const [top, second] = free;
    renderApp(<Routine />);
    await screen.findByRole('button', { name: 'Deploy with Gemini' });

    // Before the deploy there is no explanation, and every action is collapsed.
    expect(rowToggle(top!.id)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(whyFor(top!.id))).not.toBeInTheDocument();
    // A row the reader opened themselves must survive the deploy untouched.
    await user.click(rowToggle(second!.id));
    expect(rowToggle(second!.id)).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Deploy with Gemini' }));
    await screen.findByRole('button', { name: 'Redeploy with Gemini' }, { timeout: 15_000 });

    expect(rowToggle(top!.id)).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(`row-${top!.id}`)!;
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByText(whyFor(top!.id))).toBeVisible();
    expect(within(panel).getByText(/Why, for your family \(Gemini\)/)).toBeInTheDocument();

    expect(rowToggle(second!.id)).toHaveAttribute('aria-expanded', 'true');
    const third = free[2]!;
    expect(rowToggle(third.id)).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Routine page with the neighbourhood bulletin', () => {
  it('places the bulletin right after the free actions and stays free of axe violations', async () => {
    const { container } = renderApp(<Routine />);
    await screen.findByRole('button', { name: 'Deploy with Gemini' });
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const at = titles.indexOf('For your neighbourhood');
    expect(titles[at - 1]).toBe('Free actions');
    expect(titles[at + 1]).toBe('Upgrades worth making');
    expect(screen.getByRole('region', { name: 'Bulletin preview' })).toHaveTextContent(
      `Air advisory: ${plan.placeLabel}`,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
