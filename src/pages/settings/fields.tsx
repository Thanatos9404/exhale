import { Field, Switch, inputClass } from '@/components/ui/primitives';
import type { Option } from './options';

interface TextFieldProps {
  label: string;
  value: string;
  maxLength: number;
  error: string | undefined;
  onChange: (value: string) => void;
}

/** Labelled free-text input that flags itself invalid when the schema rejects it. */
export function TextField({ label, value, maxLength, error, onChange }: TextFieldProps) {
  return (
    <Field label={label} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={inputClass}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** Labelled numeric input with schema bounds. */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  hint,
  error,
  disabled,
  onChange,
}: NumberFieldProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          type="number"
          min={min}
          max={max}
          step={step}
          className={inputClass}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </Field>
  );
}

interface SelectFieldProps<T extends string | number> {
  label: string;
  value: T;
  options: readonly Option<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

/**
 * Labelled select over a fixed list of typed options. The chosen value is looked up in the
 * list, so callers get the option's own type back instead of the DOM's string.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  disabled,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className={inputClass}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const picked = options.find((o) => String(o.value) === e.target.value);
            if (picked) onChange(picked.value);
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** A bordered row with a label, an optional hint and an on/off switch. */
export function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
      <div>
        <div className="text-sm text-fg">{label}</div>
        {hint && <div className="text-xs text-subtle">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
