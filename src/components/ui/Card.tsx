/**
 * The card family: the bordered surface panels sit on, with its header and footer. Padding and
 * the heading level of the title are fixed here so cards look and read the same on every page.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The bordered surface every panel sits on. */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-line bg-surface shadow-card', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A card's h2 title with an optional description and a trailing action. */
export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
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

/** The tinted strip along the bottom of a card. */
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-surface-2 px-5 py-3 text-[13px] text-muted',
        className,
      )}
    >
      {children}
    </div>
  );
}
