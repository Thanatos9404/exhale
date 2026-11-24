/**
 * The app footer: links to the methodology, source and data provider, a status dot for the live
 * air feed, and the theme switch.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { GithubMark } from './GithubMark';
import { Logo } from './Logo';
import { Dot, Segmented } from '../ui/primitives';
import { useAppState, type ThemePref } from '@/state/AppState';
import { useAir } from '@/hooks/useAir';
import { REPO_URL } from '@/config';

function FooterLinks() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
      <span className="inline-flex items-center gap-2 font-medium text-fg">
        <Logo size={16} /> Exhale
      </span>
      <a
        className="hover:text-fg"
        href={`${REPO_URL}#how-the-numbers-work`}
        target="_blank"
        rel="noreferrer"
      >
        Methodology
      </a>
      <a
        className="inline-flex items-center gap-1 hover:text-fg"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        <GithubMark size={13} /> Source
      </a>
      <a
        className="hover:text-fg"
        href="https://open-meteo.com/en/docs/air-quality-api"
        target="_blank"
        rel="noreferrer"
      >
        Data: Open-Meteo, CAMS
      </a>
      <span>Guidance, not medical advice.</span>
    </div>
  );
}

function ThemeSwitch() {
  const { theme, setTheme } = useAppState();
  return (
    <Segmented<ThemePref>
      label="Theme"
      size="sm"
      value={theme}
      onChange={setTheme}
      options={[
        {
          value: 'system',
          label: <Monitor size={13} aria-hidden="true" />,
          title: 'System theme',
        },
        { value: 'light', label: <Sun size={13} aria-hidden="true" />, title: 'Light theme' },
        { value: 'dark', label: <Moon size={13} aria-hidden="true" />, title: 'Dark theme' },
      ]}
    />
  );
}

/** The page footer: source links, the live-feed status and the theme switch. */
export function Footer() {
  const air = useAir();
  const ok = !air.isError;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-6">
        <FooterLinks />
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2 text-[13px] text-muted" role="status">
            <Dot className={ok ? 'bg-blue' : 'bg-red'} />
            {ok ? 'Live data feeds normal' : 'Air data unavailable'}
          </span>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
