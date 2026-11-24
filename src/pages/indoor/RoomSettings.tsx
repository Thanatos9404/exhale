/**
 * Input panel of the indoor lab: outdoor air, room size, draughts, windows, purifier and smoke
 * sources. It holds no state; every edit goes back to the page as a partial room.
 */
import { Card, CardHeader, Field, Segmented, Switch, inputClass } from '@/components/ui/primitives';
import type { Ventilation } from '@/lib/science/indoor';
import { fmtInt } from '@/lib/format';
import { PURIFIERS, isPurifier, type Room } from './room';
import { SourceChecklist } from './SourceChecklist';

interface RoomSettingsProps {
  room: Room;
  /** Live outdoor PM2.5 at the selected place, µg/m³. */
  liveOutdoor: number;
  onChange: (patch: Partial<Room>) => void;
}

interface ControlProps {
  room: Room;
  onChange: (patch: Partial<Room>) => void;
}

interface SliderProps {
  label: string;
  hint: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

/** A labelled range input whose label carries the current value. */
function Slider({ label, hint, min, max, value, onChange }: SliderProps) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <input
          id={id}
          aria-describedby={d}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
      )}
    </Field>
  );
}

/** How leaky the room is, and whether the windows are open. */
function AirPaths({ room, onChange }: ControlProps) {
  return (
    <>
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
    </>
  );
}

/** The purifier size picker. */
function PurifierSelect({ room, onChange }: ControlProps) {
  return (
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
  );
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
        <Slider
          label={`Outdoor PM2.5: ${fmtInt(room.outdoor)} µg/m³`}
          hint={`Live reading here: ${liveOutdoor} µg/m³`}
          min={0}
          max={500}
          value={room.outdoor}
          onChange={(outdoor) => onChange({ outdoor })}
        />
        <Slider
          label={`Area kept closed: ${room.area} m²`}
          hint="The rooms you keep shut together, e.g. a 2BHK is about 45 to 60 m²."
          min={8}
          max={150}
          value={room.area}
          onChange={(area) => onChange({ area })}
        />
        <AirPaths room={room} onChange={onChange} />
        <PurifierSelect room={room} onChange={onChange} />
        <SourceChecklist room={room} onChange={onChange} />
      </div>
    </Card>
  );
}
