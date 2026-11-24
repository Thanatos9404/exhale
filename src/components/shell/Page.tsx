/**
 * The frame every page renders into: a title band with the page's single h1, and the centred
 * content column. Keeping both here gives every route the same width and heading structure.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** The page title band: the single h1, an optional description and page-level actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line bg-background md:flex-row md:items-end md:justify-between">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-10 pb-8 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.035em] text-fg">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-[65ch] text-[15px] text-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** The centred content column every page body sits in. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1200px] px-4 pt-8 md:px-6', className)}>
      {children}
    </div>
  );
}
