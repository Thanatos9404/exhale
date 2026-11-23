import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronsUpDown, MapPin, Monitor, Moon, Search, Sun } from 'lucide-react';
import { GithubMark } from './GithubMark';
import { Logo, Slash } from './Logo';
import { useCommandMenu } from './CommandMenu';
import { ParticleOrb } from '../ParticleOrb';
import { Avatar, Badge, Dot, Kbd, Segmented } from '../ui/primitives';
import { useAppState, type ThemePref } from '@/state/AppState';
import { useAir, useHealth } from '@/hooks/useAir';
import { REPO_URL, ROUTES } from '@/config';
import { cn } from '@/lib/cn';

/* Header ----------------------------------------------------------------------------------- */

function AiStatus() {
  const health = useHealth();
  if (health.isLoading) return null;
  const on = health.data?.ai === true;
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted lg:inline-flex" title={on ? `Gemini: ${health.data?.model}` : 'Gemini key not configured; rules engine answers'}>
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

export function Header() {
  const { household, place } = useAppState();
  const { open } = useCommandMenu();
  return (
    <header className="bg-background">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-1.5 px-4 md:px-6">
        <Link href="/" aria-label="Exhale overview" className="mr-1 inline-flex items-center gap-2 rounded-md text-fg">
          <Logo size={22} />
          <span className="hidden text-[15px] font-semibold tracking-[-0.02em] sm:inline">Exhale</span>
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
          <Badge>{household.members.length} {household.members.length === 1 ? 'person' : 'people'}</Badge>
        </Link>
        <Slash />
        <button
          type="button"
          onClick={() => open('')}
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
          className="hidden h-8 w-56 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-[13px] text-subtle transition-colors hover:border-line-strong md:inline-flex"
        >
          <Search size={14} aria-hidden="true" />
          <span className="flex-1">Search or ask…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => open('')}
          aria-label="Open command menu"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover md:hidden"
        >
          <Search size={16} aria-hidden="true" />
        </button>
        <div className="ml-2 flex items-center gap-3">
          <AiStatus />
          <AskButton />
        </div>
      </div>
    </header>
  );
}

/* Tabs ------------------------------------------------------------------------------------- */

export function Tabs() {
  const [location] = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, duration: 0.35, bounce: 0.12 };

  return (
    <nav aria-label="Primary" className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[46px] max-w-[1400px] items-center px-2 md:px-4">
        <Link
          href="/"
          tabIndex={scrolled ? 0 : -1}
          aria-hidden={!scrolled}
          className={cn(
            'grid place-items-center overflow-hidden text-fg transition-[width,opacity] duration-200 ease-[var(--ease-out)]',
            scrolled ? 'w-9 opacity-100' : 'w-0 opacity-0',
          )}
        >
          <Logo size={18} />
        </Link>
        <ul className="scrollbar-none flex h-full items-stretch overflow-x-auto" onPointerLeave={() => setHovered(null)}>
          {ROUTES.map((r) => {
            const active = r.path === '/' ? location === '/' : location.startsWith(r.path);
            return (
              <li key={r.path} className="relative flex items-center">
                <Link
                  href={r.path}
                  aria-current={active ? 'page' : undefined}
                  onPointerEnter={() => setHovered(r.path)}
                  onFocus={() => setHovered(r.path)}
                  className={cn(
                    'relative z-10 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-150',
                    active ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {r.label}
                </Link>
                {hovered === r.path && (
                  <motion.span
                    layoutId="tab-hover"
                    transition={spring}
                    aria-hidden="true"
                    className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-md bg-hover"
                  />
                )}
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    transition={spring}
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-fg"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/* Footer ----------------------------------------------------------------------------------- */

export function Footer() {
  const { theme, setTheme } = useAppState();
  const air = useAir();
  const ok = !air.isError;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
          <span className="inline-flex items-center gap-2 font-medium text-fg">
            <Logo size={16} /> Exhale
          </span>
          <a className="hover:text-fg" href={`${REPO_URL}#how-the-numbers-work`} target="_blank" rel="noreferrer">
            Methodology
          </a>
          <a className="inline-flex items-center gap-1 hover:text-fg" href={REPO_URL} target="_blank" rel="noreferrer">
            <GithubMark size={13} /> Source
          </a>
          <a className="hover:text-fg" href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">
            Data: Open-Meteo, CAMS
          </a>
          <span>Guidance, not medical advice.</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status">
            <Dot className={ok ? 'bg-blue' : 'bg-red'} />
            {ok ? 'Live data feeds normal' : 'Air data unavailable'}
          </span>
          <Segmented<ThemePref>
            label="Theme"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: <Monitor size={13} aria-hidden="true" />, title: 'System theme' },
              { value: 'light', label: <Sun size={13} aria-hidden="true" />, title: 'Light theme' },
              { value: 'dark', label: <Moon size={13} aria-hidden="true" />, title: 'Dark theme' },
            ]}
          />
        </div>
      </div>
    </footer>
  );
}

/* Page scaffold ---------------------------------------------------------------------------- */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line bg-background md:flex-row md:items-end md:justify-between">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-10 pb-8 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.035em] text-fg">{title}</h1>
            {description && <p className="mt-2 max-w-[65ch] text-[15px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 pt-8 md:px-6', className)}>{children}</div>;
}
