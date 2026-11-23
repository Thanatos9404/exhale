import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, CircleAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import type { LogLine } from '@/state/Deployments';
import { LOG_TEXT_CLASS } from './routineView';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

interface BuildLogsProps {
  logs: LogLine[];
  building: boolean;
  /** The last run failed, so the log stays open to show why. */
  failed: boolean;
}

/**
 * Collapsible build log for the current deployment. It opens on its own while a run is in
 * progress or has failed, and keeps the newest line in view as lines arrive.
 */
export function BuildLogs({ logs, building, failed }: BuildLogsProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const logRef = useRef<HTMLOListElement>(null);
  const showLogs = open || building || failed;

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [logs.length]);

  // Reduced motion keeps the fade but drops the height animation.
  const hidden = reduced ? { opacity: 0 } : { height: 0, opacity: 0 };
  const shown = reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 };

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={showLogs}
        aria-controls="build-logs"
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-[13px] font-medium text-fg hover:bg-hover"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={cn('transition-transform duration-200', showLogs && 'rotate-90')}
        />
        Build logs
        {building && <Spinner size={13} />}
        <span className="ml-auto text-xs font-normal text-subtle">
          {logs.length ? `${logs.length} lines` : 'Run a deployment to see logs'}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {showLogs && logs.length > 0 && (
          <motion.div
            id="build-logs"
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ol
              ref={logRef}
              className="max-h-64 overflow-auto border-t border-line bg-surface-2 py-2 font-mono text-[12px] leading-6"
              aria-live="polite"
            >
              {logs.map((line, i) => (
                <LogEntry key={i} line={line} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface LogEntryProps {
  line: LogLine;
}

/** One timestamped log line with its status icon. */
function LogEntry({ line }: LogEntryProps) {
  return (
    <li className="grid grid-cols-[92px_18px_1fr] gap-2 px-5">
      <span className="tabular text-subtle">
        {new Date(line.at).toTimeString().slice(0, 8)}.{String(line.at % 1000).padStart(3, '0')}
      </span>
      <LogIcon kind={line.kind} />
      <span className={LOG_TEXT_CLASS[line.kind]}>{line.text}</span>
    </li>
  );
}

interface LogIconProps {
  kind: LogLine['kind'];
}

/** Status icon for a log line; plain info lines get a small dot. */
function LogIcon({ kind }: LogIconProps) {
  const cls = 'mt-[5px]';
  if (kind === 'ok') return <Check size={13} aria-label="done" className={cn(cls, 'text-green')} />;
  if (kind === 'warn')
    return <TriangleAlert size={13} aria-label="warning" className={cn(cls, 'text-amber')} />;
  if (kind === 'error')
    return <CircleAlert size={13} aria-label="error" className={cn(cls, 'text-red')} />;
  if (kind === 'ai')
    return <Sparkles size={13} aria-label="Gemini" className={cn(cls, 'text-blue')} />;
  return <span aria-hidden="true" className="mt-[11px] ml-[5px] size-1 rounded-full bg-subtle" />;
}
