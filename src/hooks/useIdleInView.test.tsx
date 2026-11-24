import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  ManualIntersectionObserver,
  installManualIntersectionObserver,
  setSaveData,
  stubMatchMedia,
} from '@/test/observers';
import { prefersReducedData, whenIdle } from './idle';
import { useIdleInView } from './useIdleInView';

function Probe({ enabled }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useIdleInView(ref, enabled);
  return <div ref={ref}>{ready ? 'mounted' : 'waiting'}</div>;
}

function onScreen(visible: boolean): void {
  act(() => {
    ManualIntersectionObserver.current?.emit(visible);
  });
}

function pass(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let restoreObserver = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  restoreObserver = installManualIntersectionObserver();
});

afterEach(() => {
  vi.useRealTimers();
  restoreObserver();
  Reflect.deleteProperty(window, 'requestIdleCallback');
  Reflect.deleteProperty(window, 'cancelIdleCallback');
});

describe('useIdleInView', () => {
  it('waits for the element to be on screen, then for the browser to be idle', () => {
    render(<Probe />);
    pass(5000);
    expect(screen.getByText('waiting')).toBeInTheDocument();

    onScreen(true);
    expect(screen.getByText('waiting')).toBeInTheDocument();

    pass(250);
    expect(screen.getByText('mounted')).toBeInTheDocument();
  });

  it('cancels the wait when the element leaves the screen before the browser is idle', () => {
    render(<Probe />);
    onScreen(true);
    onScreen(false);
    pass(5000);
    expect(screen.getByText('waiting')).toBeInTheDocument();

    onScreen(true);
    pass(250);
    expect(screen.getByText('mounted')).toBeInTheDocument();
  });

  it('stays mounted, and stops observing, once it has fired', () => {
    render(<Probe />);
    const observer = ManualIntersectionObserver.current!;
    onScreen(true);
    pass(250);
    expect(observer.connected).toBe(false);
    expect(ManualIntersectionObserver.current).toBeUndefined();
    expect(screen.getByText('mounted')).toBeInTheDocument();
  });

  it('never observes while disabled', () => {
    render(<Probe enabled={false} />);
    pass(5000);
    expect(ManualIntersectionObserver.instances).toHaveLength(0);
    expect(screen.getByText('waiting')).toBeInTheDocument();
  });

  it('uses requestIdleCallback, with a timeout, where the browser has it', () => {
    let idle: (() => void) | undefined;
    const request = vi.fn((work: () => void) => {
      idle = work;
      return 7;
    });
    const cancel = vi.fn();
    Object.assign(window, { requestIdleCallback: request, cancelIdleCallback: cancel });

    render(<Probe />);
    onScreen(true);
    expect(request).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    pass(5000);
    expect(screen.getByText('waiting')).toBeInTheDocument();

    onScreen(false);
    expect(cancel).toHaveBeenCalledWith(7);

    onScreen(true);
    act(() => {
      idle?.();
    });
    expect(screen.getByText('mounted')).toBeInTheDocument();
  });
});

describe('whenIdle', () => {
  it('falls back to a short timeout, which the returned function cancels', () => {
    const work = vi.fn();
    const cancel = whenIdle(work);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(work).not.toHaveBeenCalled();

    whenIdle(work);
    vi.advanceTimersByTime(250);
    expect(work).toHaveBeenCalledOnce();
  });
});

describe('prefersReducedData', () => {
  afterEach(() => setSaveData(false));

  it('is off by default', () => {
    expect(prefersReducedData()).toBe(false);
  });

  it('follows navigator.connection.saveData', () => {
    setSaveData(true);
    expect(prefersReducedData()).toBe(true);
  });

  it('follows the prefers-reduced-data media query', () => {
    const restore = stubMatchMedia((query) => query.includes('prefers-reduced-data'));
    expect(prefersReducedData()).toBe(true);
    restore();
  });
});
