/**
 * The sticky primary navigation: one tab per page, a hover pill and an active underline that
 * slide between tabs, and a compact logo that appears once the header has scrolled away.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Logo } from './Logo';
import { SharedIndicator } from './SharedIndicator';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { ROUTES } from '@/config';
import { cn } from '@/lib/cn';

type RouteEntry = (typeof ROUTES)[number];

/** True once the page has scrolled past the header, when the tab bar shows its own logo. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
}

interface TabItemProps {
  route: RouteEntry;
  active: boolean;
  hovered: boolean;
  /** False for reduced motion: the indicators jump instead of sliding. */
  slide: boolean;
  onHover: (path: string) => void;
}

function TabItem({ route, active, hovered, slide, onHover }: TabItemProps) {
  return (
    <li className="relative flex items-center">
      <Link
        href={route.path}
        aria-current={active ? 'page' : undefined}
        onPointerEnter={() => onHover(route.path)}
        onFocus={() => onHover(route.path)}
        className={cn(
          'relative z-10 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-150',
          active ? 'text-fg' : 'text-muted hover:text-fg',
        )}
      >
        {route.label}
      </Link>
      {hovered && (
        <SharedIndicator
          id="tab-hover"
          animate={slide}
          className="absolute inset-x-0 top-1/2 h-8 origin-top-left -translate-y-1/2 rounded-md bg-hover"
        />
      )}
      {active && (
        <SharedIndicator
          id="tab-active"
          animate={slide}
          className="absolute inset-x-2 bottom-0 h-0.5 origin-top-left rounded-full bg-fg"
        />
      )}
    </li>
  );
}

/** The sticky primary navigation, with a sliding hover pill and active underline. */
export function Tabs() {
  const [location] = useLocation();
  const [hovered, setHovered] = useState<string | null>(null);
  const scrolled = useScrolled();
  const reduced = usePrefersReducedMotion();

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex h-[46px] max-w-[1400px] items-center px-2 md:px-4">
        <Link
          href="/"
          aria-label="Exhale overview"
          tabIndex={scrolled ? 0 : -1}
          aria-hidden={!scrolled}
          className={cn(
            'grid place-items-center overflow-hidden text-fg transition-[width,opacity] duration-200 ease-[var(--ease-out)]',
            scrolled ? 'w-9 opacity-100' : 'w-0 opacity-0',
          )}
        >
          <Logo size={18} />
        </Link>
        <ul
          className="scrollbar-none flex h-full items-stretch overflow-x-auto"
          onPointerLeave={() => setHovered(null)}
        >
          {ROUTES.map((r) => (
            <TabItem
              key={r.path}
              route={r}
              active={r.path === '/' ? location === '/' : location.startsWith(r.path)}
              hovered={hovered === r.path}
              slide={!reduced}
              onHover={setHovered}
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}
