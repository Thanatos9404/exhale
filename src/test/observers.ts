/**
 * Hand-driven stand-ins for browser signals jsdom cannot produce: element visibility, media
 * queries and the data-saver flag. A test installs one to decide what the component sees.
 */
import { vi } from 'vitest';

/**
 * An IntersectionObserver the test drives by hand: `emit(true)` reports the observed element as
 * on screen. Install it with `vi.stubGlobal('IntersectionObserver', ManualIntersectionObserver)`.
 */
export class ManualIntersectionObserver {
  static instances: ManualIntersectionObserver[] = [];

  /** The most recently created observer that is still connected. */
  static get current(): ManualIntersectionObserver | undefined {
    return ManualIntersectionObserver.instances.findLast((io) => io.connected);
  }

  static reset(): void {
    ManualIntersectionObserver.instances = [];
  }

  connected = true;
  observe = vi.fn();
  unobserve = vi.fn();
  takeRecords = () => [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    ManualIntersectionObserver.instances.push(this);
  }

  disconnect(): void {
    this.connected = false;
  }

  emit(isIntersecting: boolean): void {
    if (!this.connected) return;
    const entry = { isIntersecting } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

/** Pretends the browser's data saver is on (or off again) through `navigator.connection`. */
export function setSaveData(on: boolean): void {
  if (on) {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  } else {
    Reflect.deleteProperty(navigator, 'connection');
  }
}

/**
 * Swaps in the manual IntersectionObserver. The shared setup defines the global as writable but
 * not configurable, so it is assigned rather than stubbed. Returns the function that restores it.
 */
export function installManualIntersectionObserver(): () => void {
  const original = globalThis.IntersectionObserver;
  ManualIntersectionObserver.reset();
  globalThis.IntersectionObserver =
    ManualIntersectionObserver as unknown as typeof IntersectionObserver;
  return () => {
    globalThis.IntersectionObserver = original;
  };
}

/** Answers media queries with `matches(query)`. Returns the function that restores the original. */
export function stubMatchMedia(matches: (query: string) => boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  window.matchMedia = (query: string) =>
    ({
      media: query,
      matches: matches(query),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
  return () => {
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else Reflect.deleteProperty(window, 'matchMedia');
  };
}
