import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axeViolations, renderApp } from '@/test/render';
import { makeSnapshot } from '@/test/fixtures';

vi.mock('@/lib/air/openMeteo', async (orig) => {
  const actual = await orig<typeof import('@/lib/air/openMeteo')>();
  return { ...actual, fetchAirSnapshot: vi.fn(async () => makeSnapshot()), searchPlaces: vi.fn(async () => []) };
});

// Health check and API calls never leave the test.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ ok: true, ai: false, model: null }), { headers: { 'content-type': 'application/json' } })),
);

describe('Overview page', () => {
  it('shows the live AQI, the smog-lid headline and the routine', async () => {
    const { default: Overview } = await import('./Overview');
    renderApp(<Overview />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(await screen.findByText(/air can only mix/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today’s routine' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Scrub the next/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { default: Overview } = await import('./Overview');
    const { container } = renderApp(<Overview />);
    await screen.findByText(/air can only mix/);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Impact page', () => {
  it('recomputes totals when a change is switched off', async () => {
    const { default: Impact } = await import('./Impact');
    renderApp(<Impact />);
    const coil = await screen.findByRole('switch', { name: /Apply: Swap the mosquito coil/ });
    const before = screen.getByText('Cigarettes avoided').parentElement!.textContent;
    await userEvent.click(coil);
    await waitFor(() => expect(screen.getByText('Cigarettes avoided').parentElement!.textContent).not.toBe(before));
    expect(screen.getByRole('button', { name: 'Apply all' })).toBeEnabled();
  });
});

describe('Indoor lab', () => {
  it('lowers indoor PM2.5 when a purifier is added', async () => {
    const { default: Indoor } = await import('./Indoor');
    renderApp(<Indoor />);
    const readout = () => Number(screen.getByText('Indoor PM2.5').parentElement!.querySelector('dd span')!.textContent!.replace(/,/g, ''));
    await screen.findByText('Indoor PM2.5');
    const before = readout();
    await userEvent.selectOptions(screen.getByLabelText('Air purifier'), 'large');
    expect(readout()).toBeLessThan(before);
  });
});

describe('Settings page', () => {
  it('validates fields before saving', async () => {
    const { default: Settings } = await import('./Settings');
    renderApp(<Settings />);
    const general = screen.getByRole('region', { name: 'General' });
    const name = within(general).getByLabelText('Household name');
    await userEvent.clear(name);
    await userEvent.type(name, '<script>');
    expect(await within(general).findByRole('alert')).toHaveTextContent(/letters, numbers/);
  });

  it('adds a person up to the limit', async () => {
    const { default: Settings } = await import('./Settings');
    renderApp(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(screen.getByText('Person 4', { selector: 'span' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { default: Settings } = await import('./Settings');
    const { container } = renderApp(<Settings />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Command menu', () => {
  it('says so when no place matches the search', async () => {
    const { default: Overview } = await import('./Overview');
    renderApp(<Overview />);
    await screen.findByText(/air can only mix/);
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(await screen.findByPlaceholderText(/Search a city/), 'qqzzxx');
    expect(await screen.findByText(/No places match “qqzzxx”/)).toBeInTheDocument();
  });
});
