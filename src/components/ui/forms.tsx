/**
 * Form primitives: the labelled field, the shared input look, the segmented radio group and
 * the switch. Their boundaries use --field-border (3:1 against every surface, WCAG 1.4.11) and
 * every target is at least 24 CSS pixels in both directions (WCAG 2.5.8).
 */
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { rovingItemProps } from './roving';

/** A labelled form field that wires the control to its hint and its error message. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-red">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Shared classes for text inputs and selects. Focus keeps the global 2px --focus outline: a
 * solid ring that reaches 3:1 and, unlike a box-shadow, survives forced-colours mode.
 */
export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-field-border bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-[border-color] duration-150 hover:border-fg focus-visible:border-fg aria-[invalid=true]:border-red';

/**
 * A segmented control with radio-group semantics: one Tab stop, arrow keys move and select,
 * Home and End jump to the ends.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  const group = { values: options.map((o) => o.value), value, onChange, axis: 'both' } as const;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-field-border bg-surface-2 p-0.5"
    >
      {options.map((o, index) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            {...rovingItemProps(group, index)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-colors duration-150',
              size === 'sm' ? 'h-6 min-w-7 px-2 text-xs' : 'h-7 min-w-8 px-2.5 text-[13px]',
              active
                ? 'bg-surface text-fg shadow-[0_0_0_1px_var(--field-border)]'
                : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * An on/off toggle with switch semantics and an accessible label. Both tracks are 3:1 against
 * the surface and against the white thumb, so the state never rests on a hairline.
 */
export function Switch({
  checked,
  onChange,
  label,
  id,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
  /** Id of a visible note that explains what the switch does. */
  describedBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150',
        checked ? 'bg-blue-solid' : 'bg-field-border',
      )}
    >
      <span
        className={cn(
          'ui-switch-thumb inline-block size-[18px] rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-out)]',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
