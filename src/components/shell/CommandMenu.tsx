import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { useLocation } from 'wouter';
import { ArrowRight, Compass, LocateFixed, MapPin, Monitor, Moon, Rocket, Sparkles, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { searchPlaces, type GeoResult } from '@/lib/air/openMeteo';
import { useAppState } from '@/state/AppState';
import { useDeployments } from '@/state/Deployments';
import { ROUTES } from '@/config';
import { locateUser } from '@/lib/geo';

/**
 * ⌘K menu: search any city (live geocoding), jump between pages, run actions, or hand a
 * question straight to the assistant. Built on cmdk, which supplies the dialog semantics,
 * focus trap and keyboard navigation.
 */

interface CommandMenuState {
  open: (initial?: string) => void;
  pendingQuestion: string | null;
  takePendingQuestion: () => string | null;
}

const Ctx = createContext<CommandMenuState | null>(null);

export function useCommandMenu(): CommandMenuState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCommandMenu must be used inside CommandMenuProvider');
  return v;
}

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingQuestion, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open = useCallback((initial = '') => {
    setQuery(initial);
    setOpen(true);
  }, []);

  const takePendingQuestion = useCallback(() => {
    const q = pendingQuestion;
    if (q) setPending(null);
    return q;
  }, [pendingQuestion]);

  const value = useMemo(() => ({ open, pendingQuestion, takePendingQuestion }), [open, pendingQuestion, takePendingQuestion]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandDialog
        open={isOpen}
        onOpenChange={setOpen}
        query={query}
        setQuery={setQuery}
        onAsk={(q) => setPending(q)}
      />
    </Ctx.Provider>
  );
}

function CommandDialog({
  open,
  onOpenChange,
  query,
  setQuery,
  onAsk,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  onAsk: (q: string) => void;
}) {
  const [, navigate] = useLocation();
  const { setPlace, recentPlaces, setTheme } = useAppState();
  const { deploy } = useDeployments();
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced, abortable city search.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      searchPlaces(q, { signal: ctrl.signal })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  const close = () => onOpenChange(false);
  const go = (path: string) => {
    navigate(path);
    close();
  };

  const switchToMyLocation = async () => {
    close();
    const id = toast.loading('Finding your location…');
    try {
      const place = await locateUser();
      setPlace(place);
      toast.success(`Switched to ${place.label}`, { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Location unavailable', { id });
    }
  };

  const item =
    'flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-fg data-[selected=true]:bg-hover aria-disabled:opacity-50';
  const heading =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
      contentClassName="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Compass size={16} className="text-subtle" aria-hidden="true" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search a city, jump to a page, or ask Exhale…"
          className="h-12 w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
        />
      </div>
      <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
          {searching ? 'Searching…' : 'No results.'}
        </Command.Empty>

        {query.trim().length > 2 && (
          <Command.Group heading="Assistant" className={heading}>
            <Command.Item
              value={`ask ${query}`}
              className={item}
              onSelect={() => {
                onAsk(query.trim().slice(0, 500));
                go('/assistant');
              }}
            >
              <Sparkles size={16} aria-hidden="true" className="text-blue" />
              <span className="truncate">Ask Exhale: “{query.trim()}”</span>
            </Command.Item>
          </Command.Group>
        )}

        <Command.Group heading="Places" className={heading}>
          <Command.Item value="use-my-location" className={item} onSelect={() => void switchToMyLocation()}>
            <LocateFixed size={16} aria-hidden="true" className="text-muted" />
            Use my current location
          </Command.Item>
          {results.map((r) => (
            <Command.Item
              key={r.id}
              value={`place-${r.id}`}
              className={item}
              onSelect={() => {
                setPlace(r);
                toast.success(`Switched to ${r.label}`);
                close();
              }}
            >
              <MapPin size={16} aria-hidden="true" className="text-muted" />
              <span className="truncate">{r.name}</span>
              <span className="ml-auto truncate text-xs text-subtle">{r.region}</span>
            </Command.Item>
          ))}
          {results.length === 0 &&
            recentPlaces.map((p) => (
              <Command.Item key={p.label} value={`recent-${p.label}`} className={item} onSelect={() => { setPlace(p); close(); }}>
                <MapPin size={16} aria-hidden="true" className="text-muted" />
                <span className="truncate">{p.label}</span>
                <span className="ml-auto text-xs text-subtle">Recent</span>
              </Command.Item>
            ))}
        </Command.Group>

        <Command.Group heading="Go to" className={heading}>
          {ROUTES.filter((r) => !query || r.label.toLowerCase().includes(query.toLowerCase())).map((r) => (
            <Command.Item key={r.path} value={`nav-${r.path}`} className={item} onSelect={() => go(r.path)}>
              <ArrowRight size={16} aria-hidden="true" className="text-muted" />
              {r.label}
            </Command.Item>
          ))}
        </Command.Group>

        {!query && (
          <Command.Group heading="Actions" className={heading}>
            <Command.Item
              value="deploy"
              className={item}
              onSelect={() => {
                go('/routine');
                void deploy();
              }}
            >
              <Rocket size={16} aria-hidden="true" className="text-muted" />
              Deploy today’s routine
            </Command.Item>
            <Command.Item value="theme-dark" className={item} onSelect={() => { setTheme('dark'); close(); }}>
              <Moon size={16} aria-hidden="true" className="text-muted" /> Dark theme
            </Command.Item>
            <Command.Item value="theme-light" className={item} onSelect={() => { setTheme('light'); close(); }}>
              <Sun size={16} aria-hidden="true" className="text-muted" /> Light theme
            </Command.Item>
            <Command.Item value="theme-system" className={item} onSelect={() => { setTheme('system'); close(); }}>
              <Monitor size={16} aria-hidden="true" className="text-muted" /> System theme
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-xs text-subtle">
        <span>City search by Open-Meteo</span>
        <span>
          <kbd className="font-sans">↑↓</kbd> to move, <kbd className="font-sans">↵</kbd> to select, <kbd className="font-sans">esc</kbd> to close
        </span>
      </div>
    </Command.Dialog>
  );
}
