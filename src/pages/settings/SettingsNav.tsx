import { SECTIONS } from './options';

/** In-page links to each settings section; a row on phones, a sticky column on wider screens. */
export function SettingsNav() {
  return (
    <nav aria-label="Settings sections" className="md:sticky md:top-20 md:self-start">
      <ul className="scrollbar-none flex gap-1 overflow-x-auto md:flex-col">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted hover:bg-hover hover:text-fg"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
