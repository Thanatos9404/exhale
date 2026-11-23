import { Card, CardHeader, Field, Segmented, Switch, inputClass } from '@/components/ui/primitives';
import type { Ventilation } from '@/lib/science/indoor';
import { fmtInt } from '@/lib/format';
import { PURIFIERS, SOURCES, isPurifier, type Room, type SourceKey } from './room';

interface RoomSettingsProps {
  room: Room;
  /** Live outdoor PM2.5 at the selected place, µg/m³. */
  liveOutdoor: number;
  onChange: (patch: Partial<Room>) => void;
}

/** The lab's inputs: outdoor air, room size, draughts, windows, purifier and smoke sources. */
export function RoomSettings({ room, liveOutdoor, onChange }: RoomSettingsProps) {
  return (
    <Card>
      <CardHeader
        title="Room settings"
        description="Starts from your household profile and live outdoor air."
      />
      <div className="space-y-5 px-5 pb-5">
        <Field
          label={`Outdoor PM2.5: ${fmtInt(room.outdoor)} µg/m³`}
          hint={`Live reading here: ${liveOutdoor} µg/m³`}
        >
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="range"
              min={0}
              max={500}
              value={room.outdoor}
              onChange={(e) => onChange({ outdoor: Number(e.target.value) })}
              className="w-full"
            />
          )}
        </Field>
        <Field
          label={`Area kept closed: ${room.area} m²`}
          hint="The rooms you keep shut together, e.g. a 2BHK is about 45 to 60 m²."
        >
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="range"
              min={8}
              max={150}
              value={room.area}
              onChange={(e) => onChange({ area: Number(e.target.value) })}
              className="w-full"
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted" id="draught">
            Draught-proofing
          </span>
          <Segmented<Ventilation>
            label="Draught-proofing"
            value={room.ventilation}
            onChange={(v) => onChange({ ventilation: v })}
            options={[
              { value: 'sealed', label: 'Sealed' },
              { value: 'normal', label: 'Typical' },
              { value: 'leaky', label: 'Leaky' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between">
          <label htmlFor="win" className="text-[13px] font-medium text-muted">
            Windows open
          </label>
          <Switch
            id="win"
            checked={room.windowsOpen}
            onChange={(v) => onChange({ windowsOpen: v })}
            label="Windows open"
          />
        </div>
        <Field label="Air purifier">
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={room.purifier}
              onChange={(e) => {
                const value = e.target.value;
                if (isPurifier(value)) onChange({ purifier: value });
              }}
            >
              {PURIFIERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <SourceChecklist room={room} onChange={onChange} />
      </div>
    </Card>
  );
}

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

function SourceChecklist({ room, onChange }: SourceChecklistProps) {
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
