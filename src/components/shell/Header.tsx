/**
 * The top bar: brand, household, location switcher, search and the assistant shortcut, plus the
 * AI status badge that wide screens show.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { ChevronsUpDown, MapPin, Search } from 'lucide-react';
import { Logo, Slash } from './Logo';
import { preloadCommandMenu, useCommandMenu } from './CommandMenu';
import { ParticleOrb } from '../ParticleOrb';
import { Avatar, Badge, Dot, Kbd } from '../ui/primitives';
import { useAppState } from '@/state/AppState';
import { useHealth } from '@/hooks/useAir';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/** The viewport from which the status badge is displayed (Tailwind's `lg`). */
const BADGE_VISIBLE = '(min-width: 64rem)';

/** Which AI answers. The health check only runs on viewports wide enough to show the badge. */
function AiStatus() {
  const shown = useMediaQuery(BADGE_VISIBLE, true);
  const health = useHealth(shown);
  if (!shown || health.isLoading) return null;
  const on = health.data?.ai === true;
  return (
    <span
      className="hidden items-center gap-1.5 text-xs text-muted lg:inline-flex"
      title={
        on ? `Gemini: ${health.data?.model}` : 'Gemini key not configured; rules engine answers'
      }
    >
      <Dot className={on ? 'bg-green' : 'bg-amber'} />
      {on ? 'Gemini connected' : 'Rules mode'}
    </span>
  );
}

function AskButton() {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href="/assistant"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="press inline-flex h-8 items-center gap-2 rounded-full border border-line-strong bg-surface py-0 pr-1.5 pl-1.5 sm:pr-3 text-[13px] font-medium text-fg transition-colors hover:bg-hover"
    >
      <span className="grid size-6 place-items-center rounded-full bg-hover text-fg">
        <ParticleOrb size={18} active={hover} />
      </span>
      <span className="hidden whitespace-nowrap sm:inline">Ask Exhale</span>
      <span className="sr-only sm:hidden">Ask Exhale</span>
    </Link>
  );
}

/** The brand mark and the household chip that links to settings. */
function Identity() {
  const { household } = useAppState();
  return (
    <>
      <Link
        href="/"
        aria-label="Exhale overview"
        className="mr-1 inline-flex items-center gap-2 rounded-md text-fg"
      >
        <Logo size={22} />
        <span className="hidden text-[15px] font-semibold tracking-[-0.02em] sm:inline">
          Exhale
        </span>
      </Link>
      <span className="hidden md:inline-flex">
        <Slash />
      </span>
      <Link
        href="/settings"
        className="hidden min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium text-fg hover:bg-hover md:inline-flex"
      >
        <Avatar name={household.name} size={20} />
        <span className="max-w-[160px] truncate">{household.name}</span>
        <Badge>
          {household.members.length} {household.members.length === 1 ? 'person' : 'people'}
        </Badge>
      </Link>
    </>
  );
}

/**
 * The current place, the search field and its compact twin. Each opens the command menu, and
 * pointing at or focusing one starts loading the menu's code so the click finds it ready.
 */
function MenuTriggers() {
  const { place } = useAppState();
  const { open } = useCommandMenu();
  const warm = { onPointerEnter: preloadCommandMenu, onFocus: preloadCommandMenu };
  return (
    <>
      <button
        type="button"
        onClick={() => open('')}
        {...warm}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-fg hover:bg-hover"
        aria-label={`Location: ${place.label}. Change location`}
      >
        <MapPin size={15} aria-hidden="true" className="shrink-0 text-muted" />
        <span className="max-w-[38vw] truncate sm:max-w-[220px]">{place.label}</span>
        <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-subtle" />
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => open('')}
        {...warm}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-[13px] text-subtle transition-colors hover:border-line-strong md:inline-flex"
      >
        <Search size={14} aria-hidden="true" />
        <span className="flex-1">Search or ask…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <button
        type="button"
        onClick={() => open('')}
        {...warm}
        aria-label="Open command menu"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover md:hidden"
      >
        <Search size={16} aria-hidden="true" />
      </button>
    </>
  );
}

/** The top bar: brand, household, location switcher, search and the assistant shortcut. */
export function Header() {
  return (
    <header className="bg-background">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-1.5 px-4 md:px-6">
        <Identity />
        <Slash />
        <MenuTriggers />
        <div className="ml-2 flex items-center gap-3">
          <AiStatus />
          <AskButton />
        </div>
      </div>
    </header>
  );
}
