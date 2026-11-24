/**
 * The app's button and the matching look for links. Every size is at least 32 CSS pixels in
 * both directions, so an icon-only button still meets the target-size minimum (WCAG 2.5.8).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'error';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-fg text-background hover:opacity-90 border border-transparent',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover',
  tertiary: 'bg-transparent text-fg border border-transparent hover:bg-hover',
  error: 'bg-red-solid text-white border border-transparent hover:opacity-90',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 min-w-8 px-2.5 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 min-w-9 px-3 text-sm gap-2 rounded-md',
  lg: 'h-11 min-w-11 px-4 text-[15px] gap-2 rounded-lg',
};

/** Button look for links (navigation stays an <a>, never a button inside a link). */
export function buttonStyles(
  variant: Variant = 'secondary',
  size: Size = 'md',
  className?: string,
): string {
  return cn(
    'press inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
    'transition-[background-color,opacity,border-color] duration-150 ease-out',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

/** The app's button: four variants, three sizes, and a busy state that blocks clicks. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leading,
    trailing,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={(disabled ?? false) || loading}
      aria-busy={loading || undefined}
      className={cn(
        'press inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,opacity,border-color] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : leading}
      {children}
      {trailing}
    </button>
  );
});
