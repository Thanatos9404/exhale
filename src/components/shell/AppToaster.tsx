/**
 * The toast library, kept in one lazily loaded module: the styled toaster and the `toast`
 * function behind `notify`.
 */
import { useEffect } from 'react';
import { Toaster, toast } from 'sonner';
import type { ThemePref } from '@/state/AppState';
import { toasterMounted } from './toasts';

export { toast };

/** The app's toaster. It reports when it is listening, so queued toasts can be shown. */
export default function AppToaster({ theme }: { theme: ThemePref }) {
  useEffect(() => toasterMounted(), []);
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        className: 'font-sans',
        style: {
          background: 'var(--surface)',
          color: 'var(--fg)',
          border: '1px solid var(--line)',
        },
      }}
    />
  );
}
