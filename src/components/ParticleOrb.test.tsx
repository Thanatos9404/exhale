import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { stubMatchMedia } from '@/test/observers';
import { ParticleOrb } from './ParticleOrb';

const FRAME_MS = 16;

/** A requestAnimationFrame the test steps by hand, on top of fake timers for the clock. */
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

/** Runs every frame that is pending, one display refresh later. */
function runFrame() {
  vi.advanceTimersByTime(FRAME_MS);
  const due = [...frames.values()];
  frames.clear();
  act(() => due.forEach((frame) => frame(performance.now())));
}

/** Runs frames until none is pending. Returns how many it took, or -1 if the loop never idles. */
function runUntilIdle(limit = 600): number {
  for (let count = 0; count <= limit; count++) {
    if (frames.size === 0) return count;
    runFrame();
  }
  return -1;
}

const ctx = {
  scale: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillStyle: '',
  globalAlpha: 1,
};
const draws = () => ctx.clearRect.mock.calls.length;

beforeEach(() => {
  vi.useFakeTimers();
  frames.clear();
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(nextFrameId, frame);
    return nextFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  ctx.clearRect.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('ParticleOrb frame loop', () => {
  it('draws one frame and then idles while inactive', () => {
    render(<ParticleOrb />);
    expect(frames.size).toBe(1);

    runFrame();
    expect(draws()).toBe(1);
    expect(frames.size).toBe(0);

    // Seconds later it has still not asked for another frame.
    vi.advanceTimersByTime(5000);
    expect(frames.size).toBe(0);
    expect(draws()).toBe(1);
  });

  it('runs every frame while active', () => {
    render(<ParticleOrb active />);
    for (let i = 0; i < 120; i++) runFrame();
    expect(draws()).toBe(120);
    expect(frames.size).toBe(1);
  });

  it('restarts on activation, settles after deactivation, then stops', () => {
    const { rerender } = render(<ParticleOrb />);
    expect(runUntilIdle()).toBe(1);

    rerender(<ParticleOrb active />);
    expect(frames.size).toBe(1);
    for (let i = 0; i < 60; i++) runFrame();
    expect(frames.size).toBe(1);

    rerender(<ParticleOrb active={false} />);
    const settling = runUntilIdle();
    // The particles ease back for about a second; they neither snap shut nor drift forever.
    expect(settling).toBeGreaterThan(30);
    expect(settling).toBeLessThan(200);

    const settled = draws();
    vi.advanceTimersByTime(5000);
    expect(frames.size).toBe(0);
    expect(draws()).toBe(settled);

    rerender(<ParticleOrb active />);
    expect(frames.size).toBe(1);
  });

  it('cancels its pending frame when it unmounts', () => {
    const { unmount } = render(<ParticleOrb active />);
    runFrame();
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('reads its colour once, not per frame, and again when the theme flips', async () => {
    const computed = vi.spyOn(window, 'getComputedStyle');
    const spinning = render(<ParticleOrb active />);
    for (let i = 0; i < 30; i++) runFrame();
    expect(computed).toHaveBeenCalledTimes(1);
    spinning.unmount();

    // An idle orb is repainted in the new colour: one read, one frame, then idle again.
    render(<ParticleOrb />);
    runUntilIdle();
    computed.mockClear();
    const drawn = draws();
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      await Promise.resolve();
    });
    expect(computed).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    expect(runUntilIdle()).toBe(1);
    expect(draws()).toBe(drawn + 1);
  });

  it('draws a single still frame for reduced motion, even while active', () => {
    const restore = stubMatchMedia((query) => query.includes('prefers-reduced-motion'));
    render(<ParticleOrb active />);
    expect(runUntilIdle()).toBe(1);
    expect(draws()).toBe(1);
    restore();
  });
});
