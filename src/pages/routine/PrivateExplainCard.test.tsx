import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as OpenMeteo from '@/lib/air/openMeteo';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations, renderApp } from '@/test/render';
import Routine from '../Routine';

/**
 * The Routine page with Firebase configured. The private AI client is a fake, so no Firebase code
 * loads and nothing leaves the test: each test scripts which engine answers, or that none does.
 */

const fake = vi.hoisted(() => ({
  prepareOnDevice: vi.fn(async (_progress?: (fraction: number) => void) => {}),
  explainPlanOnDevice: vi.fn(),
  askOnDevice: vi.fn(),
}));
vi.mock('@/services/firebase', () => ({ privateAi: fake }));

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

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

const LABEL = 'Explain on this device (Gemini Nano)';
const whyFor = (id: string) => `Privately explained: ${id}.`;

/** Explanations for every action of whatever plan the page sends. */
function answerFrom(engine: 'on-device' | 'cloud') {
  fake.explainPlanOnDevice.mockImplementation(async (plan: { items: { id: string }[] }) => ({
    why: new Map(plan.items.map((item) => [item.id, whyFor(item.id)])),
    engine,
  }));
}

/** The expand button of the first free action, and the action's id. */
function firstRow() {
  const toggle = screen
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-controls')?.startsWith('row-'));
  return { toggle: toggle!, id: toggle!.getAttribute('aria-controls')!.slice(4) };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ ok: true, ai: true, model: null })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Private explanations on the Routine page', () => {
  it('shows a labelled, described switch that is off, with no axe violations', async () => {
    const { container } = renderApp(<Routine />);
    const toggle = await screen.findByRole('switch', { name: LABEL });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription(/Health details stay in this browser/);
    // The status line is a polite live region, so progress and results are announced.
    const status = screen.getByText(/Off\. Explanations come from the server/);
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(await axeViolations(container)).toEqual([]);
    expect(fake.explainPlanOnDevice).not.toHaveBeenCalled();
  });

  it('turns on from the keyboard and explains every action on this device', async () => {
    answerFrom('on-device');
    const user = userEvent.setup();
    const { container } = renderApp(<Routine />);
    const toggle = await screen.findByRole('switch', { name: LABEL });

    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(fake.prepareOnDevice).toHaveBeenCalledTimes(1);

    await screen.findByText(/Explained by Gemini Nano on this device/);
    expect(screen.getByText('On-device')).toBeInTheDocument();
    const [plan, household] = fake.explainPlanOnDevice.mock.calls[0]!;
    expect(plan.items.length).toBeGreaterThan(0);
    expect(household).toEqual(DEFAULT_HOUSEHOLD);

    const { toggle: row, id } = firstRow();
    await user.click(row);
    const panel = document.getElementById(`row-${id}`)!;
    expect(within(panel).getByText(whyFor(id))).toBeVisible();
    expect(
      within(panel).getByText(/Why, for your family \(Gemini Nano, on this device\)/),
    ).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says Cloud (Firebase) when Gemini Nano is unavailable and Firebase falls back', async () => {
    answerFrom('cloud');
    const user = userEvent.setup();
    renderApp(<Routine />);
    await user.click(await screen.findByRole('switch', { name: LABEL }));

    await screen.findByText(/Gemini Nano is not available in this browser/);
    expect(screen.getByText('Cloud (Firebase)')).toBeInTheDocument();
    const { toggle: row, id } = firstRow();
    await user.click(row);
    expect(
      within(document.getElementById(`row-${id}`)!).getByText(
        /Why, for your family \(Gemini via Firebase\)/,
      ),
    ).toBeInTheDocument();
  });

  it('reports a failure and keeps the usual explanations', async () => {
    fake.explainPlanOnDevice.mockRejectedValue(new Error('App Check rejected the request'));
    const user = userEvent.setup();
    renderApp(<Routine />);
    await user.click(await screen.findByRole('switch', { name: LABEL }));

    await screen.findByText(/Private explanations failed \(App Check rejected the request\)/);
    expect(screen.queryByText('On-device')).not.toBeInTheDocument();
    expect(screen.queryByText('Cloud (Firebase)')).not.toBeInTheDocument();
  });

  it('shows the download progress while Gemini Nano is being prepared', async () => {
    let finish!: () => void;
    fake.prepareOnDevice.mockImplementationOnce(
      (progress) =>
        new Promise<void>((resolve) => {
          progress?.(0.25);
          finish = resolve;
        }),
    );
    answerFrom('on-device');
    const user = userEvent.setup();
    renderApp(<Routine />);
    await user.click(await screen.findByRole('switch', { name: LABEL }));

    expect(await screen.findByText(/Getting Gemini Nano ready on this device: 25%/)).toBeVisible();
    // Nothing is sent while the model is still arriving, so a download is not mistaken for
    // "on-device unavailable".
    expect(fake.explainPlanOnDevice).not.toHaveBeenCalled();
    finish();
    await screen.findByText(/Explained by Gemini Nano on this device/);
  });

  it('goes back to the server explanations when switched off', async () => {
    answerFrom('on-device');
    const user = userEvent.setup();
    renderApp(<Routine />);
    const toggle = await screen.findByRole('switch', { name: LABEL });
    await user.click(toggle);
    await screen.findByText('On-device');

    await user.click(toggle);
    await waitFor(() => expect(screen.queryByText('On-device')).not.toBeInTheDocument());
    expect(screen.getByText(/Off\. Explanations come from the server/)).toBeInTheDocument();
  });
});
