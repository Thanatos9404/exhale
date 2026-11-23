import { useEffect, useState } from 'react';

/** Resolves CSS custom properties to concrete colours and re-resolves when the theme flips. */
export function useCssVars<T extends string>(names: readonly T[]): Record<T, string> {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim() || '#888'])) as Record<T, string>;
  };
  const [vars, setVars] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setVars(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join(',')]);
  return vars;
}

/** True while the element is on screen and the tab is visible: used to pause animation loops. */
export function useInView<E extends Element>(ref: React.RefObject<E | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const update = () => setInView(onScreen && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      onScreen = Boolean(e?.isIntersecting);
      update();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref]);
  return inView;
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
