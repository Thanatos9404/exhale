/**
 * Mounts the toaster only when it is needed: on the first toast, or once the browser is idle
 * after first paint (skipped for data-saver users, who load it with their first toast).
 */
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { prefersReducedData, whenIdle } from '@/hooks/idle';
import type { ThemePref } from '@/state/AppState';
import { isToasterWanted, onToasterWanted, requestToaster } from './toasts';

const AppToaster = lazy(() => import('./AppToaster'));

/** The slot the toaster appears in. Renders nothing until a toaster has been asked for. */
export function ToastHost({ theme }: { theme: ThemePref }) {
  const wanted = useSyncExternalStore(onToasterWanted, isToasterWanted);

  useEffect(() => {
    if (prefersReducedData()) return;
    return whenIdle(requestToaster);
  }, []);

  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <AppToaster theme={theme} />
    </Suspense>
  );
}
