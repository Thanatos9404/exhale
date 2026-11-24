/**
 * Checklist of what is burning indoors right now, plus the kitchen hood, for the settings panel
 * of the indoor lab.
 */
import { SOURCES, type Room, type SourceKey } from './room';

interface SourceChecklistProps {
  room: Room;
  onChange: (patch: Partial<Room>) => void;
}

/** Returns a copy of `sources` with `key` switched on or off. */
function withSource(sources: ReadonlySet<SourceKey>, key: SourceKey, on: boolean): Set<SourceKey> {
  const next = new Set(sources);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

/** Checkboxes for what is burning indoors right now, plus the kitchen hood. */
export function SourceChecklist({ room, onChange }: SourceChecklistProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-muted">Burning right now</legend>
      <div className="space-y-2">
        {SOURCES.map((s) => (
          <label key={s.key} className="flex items-center gap-2.5 text-sm text-fg">
            <input
              type="checkbox"
              className="size-4 accent-[var(--fg)]"
              checked={room.sources.has(s.key)}
              onChange={(e) =>
                onChange({ sources: withSource(room.sources, s.key, e.target.checked) })
              }
            />
            {s.label}
          </label>
        ))}
        <label className="flex items-center gap-2.5 text-sm text-fg">
          <input
            type="checkbox"
            className="size-4 accent-[var(--fg)]"
            checked={room.exhaust}
            onChange={(e) => onChange({ exhaust: e.target.checked })}
          />
          Kitchen hood running
        </label>
      </div>
    </fieldset>
  );
}
