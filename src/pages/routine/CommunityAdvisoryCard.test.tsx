import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildCommunityAdvisory } from '@/lib/community/advisory';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';
import { axeViolations } from '@/test/render';
import { CommunityAdvisoryCard } from './CommunityAdvisoryCard';

const snapshot = makeSnapshot();
const plan = buildPlan(DEFAULT_HOUSEHOLD, snapshot, new Date('2026-11-23T00:00:00Z'));
const english = buildCommunityAdvisory(plan, snapshot.place, 'en');
const hindi = buildCommunityAdvisory(plan, snapshot.place, 'hi');

const renderCard = () => render(<CommunityAdvisoryCard plan={plan} place={snapshot.place} />);
const preview = () => screen.getByRole('region', { name: 'Bulletin preview' });
/** The paragraph that holds the message; `toHaveTextContent` would collapse its line breaks. */
const message = () => preview().querySelector('p')!;
const status = () => screen.getByRole('status');

/** Gives jsdom a Web Share API for one test. */
function stubShare(share: (data: ShareData) => Promise<void>) {
  const spy = vi.fn(share);
  Object.defineProperty(navigator, 'share', { value: spy, configurable: true });
  return spy;
}

/** Swaps `navigator.clipboard` for the length of `run`, then puts the original back. */
async function withClipboard(clipboard: unknown, run: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  try {
    await run();
  } finally {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('CommunityAdvisoryCard', () => {
  it('renders the titled card with a read-only preview of the English bulletin', () => {
    renderCard();
    expect(
      screen.getByRole('heading', { level: 2, name: 'For your neighbourhood' }),
    ).toBeInTheDocument();
    expect(message().textContent).toBe(english.text);
    expect(message()).toHaveAttribute('lang', 'en');
    expect(within(preview()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(status()).toHaveAttribute('aria-live', 'polite');
    expect(status()).toBeEmptyDOMElement();
  });

  it('switches the text and its lang attribute with the language toggle', async () => {
    const user = userEvent.setup();
    renderCard();
    const group = screen.getByRole('radiogroup', { name: 'Bulletin language' });
    const en = within(group).getByRole('radio', { name: 'English' });
    const hi = within(group).getByRole('radio', { name: 'हिन्दी' });
    expect(en).toBeChecked();
    expect(hi).not.toBeChecked();
    expect(within(hi).getByText('हिन्दी')).toHaveAttribute('lang', 'hi');

    await user.click(hi);
    expect(hi).toBeChecked();
    expect(en).not.toBeChecked();
    expect(message().textContent).toBe(hindi.text);
    expect(message()).toHaveAttribute('lang', 'hi');

    await user.click(en);
    expect(message().textContent).toBe(english.text);
    expect(message()).toHaveAttribute('lang', 'en');
  });

  it('copies the exact plain text and announces it, visibly and politely', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(await navigator.clipboard.readText()).toBe(english.text);
    expect(status()).toHaveTextContent('Copied. Paste it into your group chat.');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument();
  });

  it('copies the Hindi text once Hindi is chosen, and clears the old confirmation', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(status()).toHaveTextContent('Copied');

    await user.click(screen.getByRole('radio', { name: 'हिन्दी' }));
    expect(status()).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(await navigator.clipboard.readText()).toBe(hindi.text);
  });

  it('takes the confirmation down again after a few seconds', async () => {
    // Only the timeout is faked: React schedules its own work with other timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = vi.fn(async (_text: string) => {});
    await withClipboard({ writeText }, async () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
      await act(async () => {});
      expect(writeText).toHaveBeenCalledWith(english.text);
      expect(status()).toHaveTextContent('Copied');

      act(() => void vi.advanceTimersByTime(3999));
      expect(status()).toHaveTextContent('Copied');
      act(() => void vi.advanceTimersByTime(1));
      expect(status()).toBeEmptyDOMElement();
      expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    });
  });

  it('works from the keyboard alone', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveFocus();
    // The radio group is one Tab stop; the arrow keys move and select inside it.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'हिन्दी' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'हिन्दी' })).toBeChecked();
    expect(message()).toHaveAttribute('lang', 'hi');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copy message' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await navigator.clipboard.readText()).toBe(hindi.text);
    expect(status()).toHaveTextContent('Copied');
  });

  it('selects the message and explains what to do when the clipboard refuses', async () => {
    const user = userEvent.setup();
    renderCard();
    const write = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new DOMException('Write permission denied', 'NotAllowedError'));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(write).toHaveBeenCalledWith(english.text);
    expect(status()).toHaveTextContent(/Could not copy automatically. The message is selected/);
    const selection = window.getSelection()!;
    expect(selection.toString()).toBe(english.text);
    expect(selection.anchorNode).toBe(message());
    // Nothing claims success, and the button is still there to try again.
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled();
  });

  it('survives a browser with no Clipboard API at all', async () => {
    await withClipboard(undefined, async () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
      expect(await screen.findByText(/Could not copy automatically/)).toBe(status());
      expect(window.getSelection()!.toString()).toBe(english.text);
    });
  });

  it('shows Share only where the Web Share API exists', () => {
    const { unmount } = renderCard();
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
    unmount();

    stubShare(async () => {});
    renderCard();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('shares the title and the exact text of the chosen language', async () => {
    const user = userEvent.setup();
    const share = stubShare(async () => {});
    renderCard();
    await user.click(screen.getByRole('radio', { name: 'हिन्दी' }));
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ title: hindi.title, text: hindi.text });
    expect(status()).toBeEmptyDOMElement();
  });

  it('stays quiet when the share sheet is dismissed, and copies when sharing fails', async () => {
    const user = userEvent.setup();
    const share = stubShare(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(status()).toBeEmptyDOMElement();

    share.mockRejectedValueOnce(new DOMException('No share target', 'NotAllowedError'));
    await user.click(screen.getByRole('button', { name: 'Share' }));
    expect(await navigator.clipboard.readText()).toBe(english.text);
    expect(status()).toHaveTextContent('Copied');
  });

  it('has no axe violations in either language, before and after copying', async () => {
    const user = userEvent.setup();
    stubShare(async () => {});
    const { container } = renderCard();
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('radio', { name: 'हिन्दी' }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(await axeViolations(container)).toEqual([]);
  });
});
