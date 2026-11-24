import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { stubMatchMedia } from '@/test/observers';
import { renderApp } from '@/test/render';
import { Header } from './Header';
import { slideKeyframes, springProgress } from './SharedIndicator';
import { Tabs } from './Tabs';
import { ToastHost } from './ToastHost';
import { notify } from './toasts';

/** Answers `min-width` queries as a viewport of the given kind would. */
let restoreViewport = () => {};
function stubViewport(wide: boolean) {
  restoreViewport = stubMatchMedia((query) => wide && query.includes('min-width'));
}

const healthCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/health')).length;

describe('header health check', () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true, ai: false, model: null }), {
        headers: { 'content-type': 'application/json' },
      }),
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreViewport();
  });

  it('is skipped on narrow screens, where the badge is not shown', async () => {
    stubViewport(false);
    renderApp(<Header />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(healthCalls(fetchMock)).toBe(0);
    expect(screen.queryByText('Rules mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Gemini connected')).not.toBeInTheDocument();
  });

  it('runs once on wide screens and fills the badge', async () => {
    stubViewport(true);
    renderApp(<Header />);
    expect(await screen.findByText('Rules mode')).toBeInTheDocument();
    expect(healthCalls(fetchMock)).toBe(1);
  });
});

describe('tab indicators', () => {
  it('marks the current page and animates nothing on first render', () => {
    const animate = vi.fn();
    Object.assign(Element.prototype, { animate });
    renderApp(<Tabs />, { path: '/forecast' });
    expect(screen.getByRole('link', { name: 'Forecast' })).toHaveAttribute('aria-current', 'page');
    expect(animate).not.toHaveBeenCalled();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('follows a spring that starts at rest and has all but arrived by its duration', () => {
    expect(springProgress(0)).toBeCloseTo(0, 6);
    expect(springProgress(0.1)).toBeGreaterThan(0.5);
    expect(springProgress(0.35)).toBeGreaterThan(0.995);
    expect(springProgress(0.35)).toBeLessThan(1.005);
  });

  it('slides from the old box to the new one using transforms only', () => {
    const from = new DOMRect(100, 10, 80, 32);
    const to = new DOMRect(260, 10, 120, 32);
    const frames = slideKeyframes(from, to);
    expect(frames.every((frame) => Object.keys(frame).join() === 'transform')).toBe(true);
    // First frame: drawn where the old marker was, at the old marker's width.
    expect(frames[0]!.transform).toMatch(/^translate\(-160px, 0px\) scale\(0\.6666/);
    expect(frames.at(-1)!.transform).toBe('translate(0px, 0px) scale(1, 1)');
  });
});

describe('lazy toaster', () => {
  it('renders nothing until a toast is raised, then shows toasts raised before it loaded', async () => {
    const { container } = render(<ToastHost theme="dark" />);
    const empty = container.innerHTML;

    // Raised while the toaster is neither mounted nor loaded: queued, not lost.
    const id = notify.loading('Finding your location…');
    expect(container.innerHTML).toBe(empty);
    expect(await screen.findByText('Finding your location…')).toBeInTheDocument();

    // The same id replaces the toast in place.
    notify.success('Switched to Jaipur, India', id);
    expect(await screen.findByText('Switched to Jaipur, India')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Finding your location…')).not.toBeInTheDocument(),
    );
  });
});
