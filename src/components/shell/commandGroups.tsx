/**
 * The command menu's result groups: the assistant hand-off, places, page links and one-step
 * actions.
 */
import { Command } from 'cmdk';
import {
  ArrowRight,
  LocateFixed,
  MapPin,
  Monitor,
  Moon,
  Rocket,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useAppState, type ThemePref } from '@/state/AppState';
import { useDeployments } from '@/state/Deployments';
import { ROUTES } from '@/config';
import { locateUser } from '@/lib/geo';
import { notify } from './toasts';
import type { PlaceSearch } from './usePlaceSearch';

const ITEM =
  'flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-fg data-[selected=true]:bg-hover aria-disabled:opacity-50';
const HEADING =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle';

interface AssistantGroupProps {
  query: string;
  onAsk: (q: string) => void;
  go: (path: string) => void;
}

/** Hands the typed question straight to the assistant page. */
export function AssistantGroup({ query, onAsk, go }: AssistantGroupProps) {
  return (
    <Command.Group heading="Assistant" className={HEADING}>
      <Command.Item
        value={`ask ${query}`}
        className={ITEM}
        onSelect={() => {
          onAsk(query.trim().slice(0, 500));
          go('/assistant');
        }}
      >
        <Sparkles size={16} aria-hidden="true" className="text-blue" />
        <span className="truncate">Ask Exhale: “{query.trim()}”</span>
      </Command.Item>
    </Command.Group>
  );
}

/** Switches to the device location, reporting progress and failure through toasts. */
async function switchToMyLocation(setPlace: ReturnType<typeof useAppState>['setPlace']) {
  const id = notify.loading('Finding your location…');
  try {
    const place = await locateUser();
    setPlace(place);
    notify.success(`Switched to ${place.label}`, id);
  } catch (err) {
    notify.error(err instanceof Error ? err.message : 'Location unavailable', id);
  }
}

interface PlacesGroupProps {
  query: string;
  search: PlaceSearch;
  close: () => void;
}

/** Device location, live city results and, when there are none, the recent places. */
export function PlacesGroup({ query, search, close }: PlacesGroupProps) {
  const { setPlace, recentPlaces } = useAppState();
  const { places, noMatch } = search;
  return (
    <Command.Group heading="Places" className={HEADING}>
      <Command.Item
        value="use-my-location"
        className={ITEM}
        onSelect={() => {
          close();
          void switchToMyLocation(setPlace);
        }}
      >
        <LocateFixed size={16} aria-hidden="true" className="text-muted" />
        Use my current location
      </Command.Item>
      {noMatch && (
        <div role="status" className="px-3 py-2 text-[13px] text-muted">
          No places match “{query.trim()}”. Check the spelling or try a nearby city.
        </div>
      )}
      {places.map((r) => (
        <Command.Item
          key={r.id}
          value={`place-${r.id}`}
          className={ITEM}
          onSelect={() => {
            setPlace(r);
            notify.success(`Switched to ${r.label}`);
            close();
          }}
        >
          <MapPin size={16} aria-hidden="true" className="text-muted" />
          <span className="truncate">{r.name}</span>
          <span className="ml-auto truncate text-xs text-subtle">{r.region}</span>
        </Command.Item>
      ))}
      {places.length === 0 &&
        recentPlaces.map((p) => (
          <Command.Item
            key={p.label}
            value={`recent-${p.label}`}
            className={ITEM}
            onSelect={() => {
              setPlace(p);
              close();
            }}
          >
            <MapPin size={16} aria-hidden="true" className="text-muted" />
            <span className="truncate">{p.label}</span>
            <span className="ml-auto text-xs text-subtle">Recent</span>
          </Command.Item>
        ))}
    </Command.Group>
  );
}

/** Page links, filtered by the query. */
export function NavGroup({ query, go }: { query: string; go: (path: string) => void }) {
  const routes = ROUTES.filter(
    (r) => !query || r.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Command.Group heading="Go to" className={HEADING}>
      {routes.map((r) => (
        <Command.Item
          key={r.path}
          value={`nav-${r.path}`}
          className={ITEM}
          onSelect={() => go(r.path)}
        >
          <ArrowRight size={16} aria-hidden="true" className="text-muted" />
          {r.label}
        </Command.Item>
      ))}
    </Command.Group>
  );
}

const THEME_ACTIONS: { value: ThemePref; Icon: typeof Moon; label: string }[] = [
  { value: 'dark', Icon: Moon, label: 'Dark theme' },
  { value: 'light', Icon: Sun, label: 'Light theme' },
  { value: 'system', Icon: Monitor, label: 'System theme' },
];

/** One-step actions: deploy today's routine or switch the theme. */
export function ActionsGroup({ go, close }: { go: (path: string) => void; close: () => void }) {
  const { setTheme } = useAppState();
  const { deploy } = useDeployments();
  return (
    <Command.Group heading="Actions" className={HEADING}>
      <Command.Item
        value="deploy"
        className={ITEM}
        onSelect={() => {
          go('/routine');
          void deploy();
        }}
      >
        <Rocket size={16} aria-hidden="true" className="text-muted" />
        Deploy today’s routine
      </Command.Item>
      {THEME_ACTIONS.map(({ value, Icon, label }) => (
        <Command.Item
          key={value}
          value={`theme-${value}`}
          className={ITEM}
          onSelect={() => {
            setTheme(value);
            close();
          }}
        >
          <Icon size={16} aria-hidden="true" className="text-muted" /> {label}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
