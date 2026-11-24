/**
 * Focus return for the command menu. The dialog is opened from several buttons and from Ctrl+K,
 * so it has no single trigger for the dialog library to return to, and focus would otherwise
 * fall to the top of the page when it closes.
 */
import { useCallback, useEffect, useRef } from 'react';

/** Marks the command menu's dialog, so focus already inside it is never taken for the opener. */
const INSIDE_MENU = '[cmdk-dialog]';

/**
 * Sends keyboard focus back to where it was when the command menu opened. Call the returned
 * function just before opening; focus is restored once `isOpen` turns false.
 */
export function useReturnFocus(isOpen: boolean): () => void {
  const opener = useRef<HTMLElement | null>(null);

  const rememberOpener = useCallback(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    // Ctrl+K also closes the menu; focus is inside it then, and the first opener still stands.
    if (active.closest(INSIDE_MENU)) return;
    opener.current = active === document.body ? null : active;
  }, []);

  useEffect(() => {
    if (isOpen) return;
    const target = opener.current;
    opener.current = null;
    // The opener is gone when the menu navigated to another page; leave focus alone then.
    if (target?.isConnected) target.focus();
  }, [isOpen]);

  return rememberOpener;
}
