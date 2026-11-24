/**
 * Status primitives: AQI colour helpers, dots, badges, key hints, skeletons and avatars. AQI
 * colour comes in two ramps: --aqi-N for fills (3:1) and --aqi-N-text for text (4.5:1).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { AqiLevel } from '@/lib/air/aqi';

const AQI_BG = ['bg-aqi-0', 'bg-aqi-1', 'bg-aqi-2', 'bg-aqi-3', 'bg-aqi-4', 'bg-aqi-5'] as const;
const AQI_TEXT = [
  'text-aqi-0-text',
  'text-aqi-1-text',
  'text-aqi-2-text',
  'text-aqi-3-text',
  'text-aqi-4-text',
  'text-aqi-5-text',
] as const;

/** Background class for an AQI level: fills, dots and chart areas. */
export const aqiBg = (level: AqiLevel) => AQI_BG[level];
/** Text colour class for an AQI level, from the text-safe ramp (4.5:1 on every surface). */
export const aqiText = (level: AqiLevel) => AQI_TEXT[level];
/** CSS variable holding the fill colour of an AQI level. Not for text: use `aqiTextVar`. */
export const aqiVar = (level: AqiLevel) => `var(--aqi-${level})`;
/** CSS variable holding the text-safe colour of an AQI level (4.5:1 on every surface). */
export const aqiTextVar = (level: AqiLevel) => `var(--aqi-${level}-text)`;

/** A small decorative status dot, optionally pulsing. */
export function Dot({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex size-2.5 shrink-0 items-center justify-center"
    >
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-50 motion-reduce:hidden',
            className,
          )}
        />
      )}
      <span className={cn('ui-dot relative inline-flex size-2.5 rounded-full', className)} />
    </span>
  );
}

/** An AQI category as a coloured dot with its label. */
export function AqiStatus({
  level,
  label,
  className,
}: {
  level: AqiLevel;
  label: string;
  className?: string;
}) {
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

/** A small pill label in one of five tones. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A keyboard key hint. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

/** A pulsing placeholder block shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-hover motion-reduce:animate-none', className)}
    />
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A decorative gradient avatar, deterministic per name. */
export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const h = hash(name);
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full ring-1 ring-line"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${a} 70% 60%), hsl(${b} 75% 45%))`,
      }}
    />
  );
}

/** Text that only screen readers can perceive. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
