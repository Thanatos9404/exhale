/**
 * ⌘K menu: search any city (live geocoding), jump between pages, run actions, or hand a
 * question straight to the assistant. This module owns the menu's state, its Ctrl+K shortcut and
 * the hand-off to the assistant; the dialog itself (cmdk and its dialog library) is loaded the
 * first time the menu opens.
 */
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { prefersReducedData, whenIdle } from '@/hooks/idle';
import { useReturnFocus } from './useReturnFocus';

const loadDialog = () => import('./CommandDialog');
const CommandDialog = lazy(async () => ({ default: (await loadDialog()).CommandDialog }));

/** Fetches the dialog's code ahead of the first open, so the menu appears without a wait. */
export function preloadCommandMenu(): void {
  // A failed warm-up is harmless: opening the menu asks again.
  void loadDialog().catch(() => undefined);
}

interface CommandMenuState {
  open: (initial?: string) => void;
  pendingQuestion: string | null;
  takePendingQuestion: () => string | null;
}

const Ctx = createContext<CommandMenuState | null>(null);

/** Opens the command menu and reads the question it handed to the assistant. */
export function useCommandMenu(): CommandMenuState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCommandMenu must be used inside CommandMenuProvider');
  return v;
}

/** Binds Ctrl+K and Cmd+K to `onToggle` for as long as the caller is mounted. */
function useMenuShortcut(onToggle: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggle]);
}

/** Warms the dialog's code once the browser is idle, unless the user is saving data. */
function useIdlePreload(): void {
  useEffect(() => {
    if (prefersReducedData()) return;
    return whenIdle(preloadCommandMenu);
  }, []);
}

/** Mounts the command menu, binds Ctrl+K and Cmd+K, and shares its controls with the tree. */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  /** True from the first open: the dialog's code is only requested once it is wanted. */
  const [requested, setRequested] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingQuestion, setPending] = useState<string | null>(null);
  const rememberOpener = useReturnFocus(isOpen);

  const toggle = useCallback(() => {
    rememberOpener();
    setRequested(true);
    setOpen((o) => !o);
  }, [rememberOpener]);
  useMenuShortcut(toggle);
  useIdlePreload();

  const open = useCallback(
    (initial = '') => {
      rememberOpener();
      setQuery(initial);
      setRequested(true);
      setOpen(true);
    },
    [rememberOpener],
  );

  const takePendingQuestion = useCallback(() => {
    const q = pendingQuestion;
    if (q) setPending(null);
    return q;
  }, [pendingQuestion]);

  const value = useMemo(
    () => ({ open, pendingQuestion, takePendingQuestion }),
    [open, pendingQuestion, takePendingQuestion],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {requested && (
        <Suspense fallback={null}>
          <CommandDialog
            open={isOpen}
            onOpenChange={setOpen}
            query={query}
            setQuery={setQuery}
            onAsk={(q) => setPending(q)}
          />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}
