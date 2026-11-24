/**
 * Vitest setup, run before every test file: adds the jest-dom matchers, clears the DOM and
 * localStorage after each test, and stubs the browser APIs jsdom lacks. In the node environment
 * it does nothing beyond registering the matchers.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

const hasDom = typeof window !== 'undefined';

afterEach(async () => {
  if (!hasDom) return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  localStorage.clear();
});

if (hasDom) {
  // jsdom lacks these browser APIs; components feature-detect but tests should not crash.
  if (!('matchMedia' in window)) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  const stubs: Record<string, unknown> = {
    ResizeObserver: NoopObserver,
    IntersectionObserver: NoopObserver,
  };
  for (const [name, value] of Object.entries(stubs)) {
    if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value, writable: true });
  }
  if (!('scrollIntoView' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(),
      writable: true,
    });
  }
}
