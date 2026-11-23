import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { requestPlan } from '@/lib/api';
import type { PlanResponse } from '@/lib/apiTypes';
import { KEYS, readStored, writeStored } from '@/lib/storage';
import { fetchAirSnapshot } from '@/lib/air/openMeteo';
import { buildPlan } from '@/lib/planner/engine';
import { MODE_LABEL } from '@/lib/science/commute';
import { useAppState } from './AppState';

/**
 * "Deploying" a routine: the server re-fetches live data, runs the planner and asks Gemini to
 * explain it. While that runs, the UI shows a build log of the real steps with real numbers.
 */

export type LogKind = 'info' | 'ok' | 'warn' | 'error' | 'ai';
export interface LogLine {
  at: number;
  kind: LogKind;
  text: string;
}

export interface Deployment {
  id: string;
  at: string;
  placeLabel: string;
  cutPct: number;
  source: PlanResponse['source'];
  model: string | null;
  response: PlanResponse;
}

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

const Ctx = createContext<DeploymentsState | null>(null);

const deploymentSchema = z.object({
  id: z.string(),
  at: z.string(),
  placeLabel: z.string(),
  cutPct: z.number(),
  source: z.enum(['gemini', 'claude', 'rules']),
  model: z.string().nullable(),
  response: z
    .object({ plan: z.object({ items: z.array(z.unknown()) }).passthrough() })
    .passthrough(),
});

const parseHistory = (raw: unknown) => {
  const r = z.array(deploymentSchema).max(8).safeParse(raw);
  return r.success ? (r.data as unknown as Deployment[]) : null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const parseDone = (raw: unknown) => {
  const r = z.object({ day: z.string(), ids: z.array(z.string().max(40)).max(40) }).safeParse(raw);
  return r.success && r.data.day === todayKey() ? new Set(r.data.ids) : null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DeploymentsProvider({ children }: { children: ReactNode }) {
  const { household, place } = useAppState();
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Deployment[]>(
    () => readStored(KEYS.deployments, parseHistory) ?? [],
  );
  const [done, setDone] = useState<Set<string>>(
    () => readStored(KEYS.done, parseDone) ?? new Set(),
  );
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
    const pace = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    try {
      log('info', `Fetching live air quality for ${place.label} (Open-Meteo, CAMS model)`);
      const air = await fetchAirSnapshot(place);
      const now = air.hourly[air.nowIndex];
      log(
        'ok',
        `${air.hourly.length} hourly readings. Now PM2.5 ${Math.round(now?.pm25 ?? 0)} µg/m³, mixing height ${Math.round(now?.blh ?? 0)} m`,
      );
      await sleep(pace);
      const local = buildPlan(household, air);
      log(
        local.lid.stagnantHours > 0 ? 'warn' : 'ok',
        local.lid.stagnantHours > 0
          ? `Smog lid detected: ${local.lid.spans.map((s) => `${s.start} to ${s.end} at ${s.minBlh} m`).join(', ')}`
          : 'No smog lid in the next 24 h',
      );
      await sleep(pace);
      log(
        'info',
        `Simulating ${household.members.length} people × 24 h as usual: ${local.totals.baselineDoseUg.toLocaleString('en-IN')} µg inhaled`,
      );
      await sleep(pace);
      const c = household.commute;
      log(
        'info',
        `Testing ${local.items.length} changes (commute: ${MODE_LABEL[c.mode].toLowerCase()}, ${c.distanceKm} km)`,
      );
      await sleep(pace);
      log(
        'ai',
        'Asking Gemini to explain the plan and tailor indoor hacks and swaps (Claude Haiku as fallback)',
      );
      const response = await requestPlan(place, household);
      if (response.source === 'gemini')
        log(
          'ok',
          `Gemini (${response.model}) wrote ${response.ai?.items.length ?? 0} explanations`,
        );
      else if (response.source === 'claude')
        log(
          'ok',
          `Gemini busy, Claude (${response.model}) wrote ${response.ai?.items.length ?? 0} explanations`,
        );
      else log('warn', 'AI providers unavailable, using the rules engine explanations');
      const t = response.plan.totals;
      log(
        'ok',
        `Ready: dose −${Math.round(t.exposureCutPct)}%, ${t.cigarettesAvoided} cigarette-equivalents avoided, ${t.co2SavedKgWeek} kg CO2e saved a week`,
      );
      const dep: Deployment = {
        id: Math.random().toString(36).slice(2, 9),
        at: new Date().toISOString(),
        placeLabel: place.label,
        cutPct: t.exposureCutPct,
        source: response.source,
        model: response.model,
        response,
      };
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
  }, [household, place, log]);

  const toggleDone = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored(KEYS.done, { day: todayKey(), ids: [...next] });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ status, logs, latest: history[0] ?? null, history, deploy, error, done, toggleDone }),
    [status, logs, history, deploy, error, done, toggleDone],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeployments(): DeploymentsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDeployments must be used inside DeploymentsProvider');
  return v;
}
