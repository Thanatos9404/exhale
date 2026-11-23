import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { AqiLevel } from '@/lib/air/aqi';

/* Card ------------------------------------------------------------------------------------- */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, id }: { title: ReactNode; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em] text-fg">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-surface-2 px-5 py-3 text-[13px] text-muted', className)}>
      {children}
    </div>
  );
}

/* Status ----------------------------------------------------------------------------------- */

const AQI_BG = ['bg-aqi-0', 'bg-aqi-1', 'bg-aqi-2', 'bg-aqi-3', 'bg-aqi-4', 'bg-aqi-5'] as const;
const AQI_TEXT = ['text-aqi-0', 'text-aqi-1', 'text-aqi-2', 'text-aqi-3', 'text-aqi-4', 'text-aqi-5'] as const;

export const aqiBg = (level: AqiLevel) => AQI_BG[level];
export const aqiText = (level: AqiLevel) => AQI_TEXT[level];
export const aqiVar = (level: AqiLevel) => `var(--aqi-${level})`;

export function Dot({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2.5 shrink-0 items-center justify-center">
      {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-50 motion-reduce:hidden', className)} />}
      <span className={cn('relative inline-flex size-2.5 rounded-full', className)} />
    </span>
  );
}

export function AqiStatus({ level, label, className }: { level: AqiLevel; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm font-medium text-fg', className)}>
      <Dot className={aqiBg(level)} />
      {label}
    </span>
  );
}

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red';
const TONE: Record<Tone, string> = {
  neutral: 'bg-hover text-fg border-line',
  blue: 'bg-blue-soft text-blue border-transparent',
  green: 'bg-green-soft text-green border-transparent',
  amber: 'bg-amber-soft text-amber border-transparent',
  red: 'bg-red-soft text-red border-transparent',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap', TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-hover motion-reduce:animate-none', className)} />;
}

/* Gradient avatar, deterministic per name ------------------------------------------------- */

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const h = hash(name);
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full ring-1 ring-line"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${a} 70% 60%), hsl(${b} 75% 45%))` }}
    />
  );
}

/* Form fields ------------------------------------------------------------------------------ */

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

export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus-visible:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--focus)_35%,transparent)] aria-[invalid=true]:border-red';

/* Segmented control ----------------------------------------------------------------------- */

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
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium transition-colors duration-150',
              size === 'sm' ? 'h-6 min-w-7 px-2 text-xs' : 'h-7 min-w-8 px-2.5 text-[13px]',
              active ? 'bg-surface text-fg shadow-[0_0_0_1px_var(--line-strong)]' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked ? 'border-transparent bg-blue' : 'border-line-strong bg-hover',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-out)]',
          checked ? 'translate-x-[17px]' : 'translate-x-[1px]',
        )}
      />
    </button>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
