/**
 * The command palette dialog. It is the only entry to cmdk and its dialog library, so both stay
 * out of the first load until the menu is opened.
 */
import { Command } from 'cmdk';
import { useLocation } from 'wouter';
import { Compass } from 'lucide-react';
import { usePlaceSearch } from './usePlaceSearch';
import { ActionsGroup, AssistantGroup, NavGroup, PlacesGroup } from './commandGroups';

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  onAsk: (q: string) => void;
}

function KeyHints() {
  return (
    <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-xs text-subtle">
      <span>City search by Open-Meteo</span>
      <span>
        <kbd className="font-sans">↑↓</kbd> to move, <kbd className="font-sans">↵</kbd> to select,{' '}
        <kbd className="font-sans">esc</kbd> to close
      </span>
    </div>
  );
}

/** The command palette itself. cmdk supplies the dialog semantics, focus trap and key handling. */
export function CommandDialog({ open, onOpenChange, query, setQuery, onAsk }: CommandDialogProps) {
  const [, navigate] = useLocation();
  const search = usePlaceSearch(query, open);

  const close = () => onOpenChange(false);
  const go = (path: string) => {
    navigate(path);
    close();
  };

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
          {search.searching ? 'Searching…' : 'No results.'}
        </Command.Empty>

        {query.trim().length > 2 && <AssistantGroup query={query} onAsk={onAsk} go={go} />}
        <PlacesGroup query={query} search={search} close={close} />
        <NavGroup query={query} go={go} />
        {!query && <ActionsGroup go={go} close={close} />}
      </Command.List>
      <KeyHints />
    </Command.Dialog>
  );
}
