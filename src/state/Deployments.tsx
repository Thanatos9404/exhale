/**
 * "Deploying" a routine: the server re-fetches live data, runs the planner and asks Gemini to
 * explain it. While that runs, the UI shows a build log of the real steps with real numbers.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KEYS, readStored, writeStored } from '@/lib/storage';
import { useAppState } from './AppState';
import { PREFERS_REDUCED_MOTION, mediaMatches } from './media';
import {
  parseDone,
  parseHistory,
  todayKey,
  type Deployment,
  type LogKind,
  type LogLine,
} from './deploymentModel';
import { runDeployment } from './runDeployment';

export type { Deployment, LogKind, LogLine } from './deploymentModel';

type Status = 'idle' | 'building' | 'ready' | 'error';

interface DeploymentsState {
  status: Status;
  logs: LogLine[];
  latest: Deployment | null;
  history: Deployment[];
  deploy: () => Promise<void>;
  error: string | null;
  done: Set<string>;
  toggleDone: (id: string) => void;
}

/** Context behind `useDeployments`; null outside `DeploymentsProvider`. */
const Ctx = createContext<DeploymentsState | null>(null);

/** The plan items ticked off today, persisted so a reload keeps them. */
function useDoneToday() {
  const [done, setDone] = useState<Set<string>>(
    () => readStored(KEYS.done, parseDone) ?? new Set(),
  );
  const toggleDone = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored(KEYS.done, { day: todayKey(), ids: [...next] });
      return next;
    });
  }, []);
  return { done, toggleDone };
}

/** Runs deployments, keeps their build log and history, and tracks which plan items are done today. */
export function DeploymentsProvider({ children }: { children: ReactNode }) {
  const { household, place } = useAppState();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Deployment[]>(
    () => readStored(KEYS.deployments, parseHistory) ?? [],
  );
  const { done, toggleDone } = useDoneToday();
  const running = useRef(false);

  const log = useCallback((kind: LogKind, text: string) => {
    setLogs((prev) => [...prev, { at: Date.now(), kind, text }]);
  }, []);

  const deploy = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus('building');
    setError(null);
    setLogs([]);
    const pace = mediaMatches(PREFERS_REDUCED_MOTION) ? 0 : 140;
    try {
      const dep = await runDeployment({ place, household, log, pace, queryClient });
      setHistory((prev) => {
        const next = [dep, ...prev].slice(0, 6);
        writeStored(KEYS.deployments, next);
        return next;
      });
      setStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deployment failed';
      log('error', message);
      setError(message);
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [household, place, log, queryClient]);

  const value = useMemo(
    () => ({ status, logs, latest: history[0] ?? null, history, deploy, error, done, toggleDone }),
    [status, logs, history, deploy, error, done, toggleDone],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Reads deployment state and actions; throws when used outside `DeploymentsProvider`. */
export function useDeployments(): DeploymentsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDeployments must be used inside DeploymentsProvider');
  return v;
}
