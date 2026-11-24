/**
 * Shared loading, error and empty placeholders, so every page waits, fails and shows nothing in
 * the same way. The loading and error cards announce themselves to screen readers.
 */
import type { ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, Skeleton } from './ui/primitives';

/** A skeleton card that announces what is loading to screen readers. */
export function LoadingCard({
  label = 'Loading live air data',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Card className={className} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Card>
  );
}

/** An alert card for a failed air-data load, with an optional retry. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <CloudOff size={22} aria-hidden="true" className="text-muted" />
      <div>
        <p className="text-sm font-medium text-fg">Could not load air data</p>
        <p className="mt-1 text-[13px] text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

/** A dashed placeholder for a view with nothing to show yet. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="max-w-[48ch] text-[13px] text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
