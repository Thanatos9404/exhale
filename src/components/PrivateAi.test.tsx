import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as OpenMeteo from '@/lib/air/openMeteo';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations, renderApp } from '@/test/render';
import Assistant from '@/pages/Assistant';
import Routine from '@/pages/Routine';
import { EngineBadge, PRIVACY_NOTE, PrivateAiToggle } from './PrivateAi';

/**
 * The shared private-answers UI on its own, and the pages without Firebase: with no
 * VITE_FIREBASE_* configuration (as in every test run) the feature is hidden.
 */

vi.mock('@/lib/air/openMeteo', async (orig) => {
  const actual = await orig<typeof OpenMeteo>();
  return {
    ...actual,
    fetchAirSnapshot: vi.fn(async () => makeSnapshot()),
    searchPlaces: vi.fn(async () => []),
  };
});
window.scrollTo = () => {};

afterEach(() => vi.unstubAllGlobals());

describe('EngineBadge', () => {
  it('names the engine in words, not colour alone', () => {
    const { rerender } = render(<EngineBadge engine="on-device" />);
    expect(screen.getByText('On-device')).toBeInTheDocument();
    expect(screen.getByText('On-device').parentElement).toHaveTextContent('Answered: On-device');
    rerender(<EngineBadge engine="cloud" />);
    expect(screen.getByText('Cloud (Firebase)')).toBeInTheDocument();
  });
});

describe('PrivateAiToggle', () => {
  it('is a labelled switch, described by its privacy note, with no axe violations', async () => {
    const { container } = render(
      <PrivateAiToggle
        id="t"
        label="Explain on this device (Gemini Nano)"
        checked={false}
        onChange={() => {}}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Explain on this device (Gemini Nano)' });
    expect(toggle).toHaveAccessibleDescription(PRIVACY_NOTE);
    expect(
      screen.getByText('Explain on this device (Gemini Nano)').closest('label'),
    ).toHaveAttribute('for', 't');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('works from the keyboard: Tab to it, then Space or Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PrivateAiToggle id="t" label="Private" checked={false} onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('switch', { name: 'Private' })).toHaveFocus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onChange.mock.calls).toEqual([[true], [true]]);
  });

  it('leaves the note to the caller in its compact form', () => {
    render(
      <>
        <PrivateAiToggle compact id="c" noteId="n" label="Private" checked onChange={() => {}} />
        <p id="n">Elsewhere</p>
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Private' })).toHaveAccessibleDescription(
      'Elsewhere',
    );
    expect(screen.queryByText(PRIVACY_NOTE)).not.toBeInTheDocument();
  });
});

describe('without Firebase configured', () => {
  const health = () =>
    new Response(JSON.stringify({ ok: true, ai: true, model: null }), {
      headers: { 'content-type': 'application/json' },
    });

  it('shows no private switch on the Routine page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => health()),
    );
    renderApp(<Routine />);
    await screen.findByRole('button', { name: 'Deploy with Gemini' });
    expect(screen.queryByRole('switch', { name: /on this device/ })).not.toBeInTheDocument();
  });

  it('shows only the web-search switch in the Assistant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => health()),
    );
    renderApp(<Assistant />);
    await screen.findByRole('switch', { name: /Search the web/ });
    expect(screen.queryByRole('switch', { name: /on this device/ })).not.toBeInTheDocument();
  });
});
