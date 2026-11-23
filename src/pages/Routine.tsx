import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, CircleAlert, Leaf, Rocket, Sparkles, TriangleAlert, Wind } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Badge, Card, CardFooter, CardHeader, Dot } from '@/components/ui/primitives';
import { ErrorCard, LoadingCard } from '@/components/states';
import { RoutineRow } from '@/components/routine';
import { Spinner } from '@/components/ui/Spinner';
import { useLocalPlan } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { useDeployments, type LogLine } from '@/state/Deployments';
import type { AiTip } from '@/lib/apiTypes';
import { fmtCig, fmtDec, fmtDose, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Curated, conservative tips shown when Gemini is not available. */
const CURATED_HACKS: AiTip[] = [
  { title: 'Wet-mop, do not sweep', detail: 'Sweeping throws settled dust back into the air. A damp mop or cloth captures it instead.', impact: 'Less resuspended dust indoors on smoggy days' },
  { title: 'Seal the gaps under doors and windows', detail: 'Draught strips and a rolled towel slow outdoor air leaking in while the lid is down.', impact: 'Lower indoor share of outdoor smog during lid hours' },
  { title: 'Keep one clean room', detail: 'Pick the bedroom, keep its door shut and run any filter there. Sleep is a third of the day.', impact: 'Concentrates filtration where you breathe longest' },
];

const CURATED_SWAPS: AiTip[] = [
  { title: 'Report open burning', detail: 'Leaf, garbage and crop burning add directly to the night-time lid. Report it to your city or state pollution board.', impact: 'Removes a source the whole street breathes' },
  { title: 'Club errands into one trip', detail: 'One combined trip in the clean afternoon window replaces several short drives at peak hours.', impact: 'Fewer cold starts, which are the dirtiest part of a drive' },
  { title: 'Switch off idling engines', detail: 'At signals and school gates, a parked engine adds exhaust exactly where children wait.', impact: 'Lower NO₂ and particles at kerbside' },
];

export default function Routine() {
  const { household } = useAppState();
  const { plan: localPlan, isLoading, isError, error, refetch } = useLocalPlan();
  const { status, logs, latest, history, deploy, done, toggleDone } = useDeployments();

  if (isError) return <Shell><ErrorCard message={error instanceof Error ? error.message : 'Unknown error'} onRetry={() => void refetch()} /></Shell>;
  if (isLoading || !localPlan) return <Shell><LoadingCard className="h-[420px]" /></Shell>;

  const deployed = latest?.response;
  const plan = deployed?.plan ?? localPlan;
  const ai = deployed?.ai ?? null;
  const why = new Map(ai?.items.map((i) => [i.id, i.why]) ?? []);
  const writer = deployed?.source === 'claude' ? 'Claude Haiku' : 'Gemini';
  const building = status === 'building';
  const free = plan.items.filter((i) => i.freeAction);
  const upgrades = plan.items.filter((i) => !i.freeAction);
  const doneCount = free.filter((i) => done.has(i.id)).length;

  return (
    <Shell
      actions={
        <>
          <Link href="/settings" className={buttonStyles()}>
            Edit household
          </Link>
          <Button variant="primary" loading={building} leading={<Rocket size={15} aria-hidden="true" />} onClick={() => void deploy()}>
            {building ? 'Deploying…' : latest ? 'Redeploy with Gemini' : 'Deploy with Gemini'}
          </Button>
        </>
      }
    >
      <DeploymentCard building={building} status={status} logs={logs} latestAt={latest?.at ?? null} source={latest?.source ?? null} model={latest?.model ?? null} place={latest?.placeLabel ?? plan.placeLabel} />

      {ai ? (
        <Card className="mt-6">
          <div className="p-5">
            <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue">
              <Sparkles size={13} aria-hidden="true" /> Written by {writer} from your live data
            </div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-fg">{ai.headline}</h2>
            <p className="mt-2 max-w-[75ch] text-[15px] text-muted">{ai.summary}</p>
            {ai.familyNote && (
              <p className="mt-3 max-w-[75ch] rounded-lg border border-line bg-surface-2 p-3 text-[13px] text-fg">
                <strong className="font-medium">For the most sensitive: </strong>
                {ai.familyNote}
              </p>
            )}
          </div>
        </Card>
      ) : (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-dashed border-line-strong p-4 text-[13px] text-muted">
          <Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-blue" />
          <p>
            {latest
              ? 'This deployment used the rules engine because Gemini was unavailable. The numbers are identical; only the personal explanations are missing.'
              : 'Not deployed yet. These actions come straight from the planning engine using live data. Deploy to have Gemini explain each one for your family and add tailored hacks.'}
          </p>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Free actions"
          description={`${plan.horizon.start} to ${plan.horizon.end}, sorted by how much they cut your family’s dose.`}
          action={<Badge tone={doneCount === free.length && free.length > 0 ? 'green' : 'neutral'}>{doneCount}/{free.length} done</Badge>}
        />
        <div className="hidden grid-cols-[120px_64px_minmax(0,1fr)_auto_150px_36px] gap-4 border-t border-line bg-surface-2 px-5 py-2 text-xs font-medium text-subtle md:grid">
          <span>Status</span>
          <span>Time</span>
          <span>Action</span>
          <span>For</span>
          <span>Impact today</span>
          <span className="sr-only">Done</span>
        </div>
        <ul className="border-t border-line">
          {free.map((item, i) => (
            <RoutineRow key={item.id} item={item} members={household.members} why={why.get(item.id)} whyBy={writer} done={done.has(item.id)} onToggleDone={() => toggleDone(item.id)} defaultOpen={i === 0 && Boolean(ai)} />
          ))}
        </ul>
        <CardFooter>
          <span>
            All free actions together: <strong className="font-semibold text-fg">−{Math.round(plan.totals.exposureCutPct)}%</strong> dose,{' '}
            {fmtDose(plan.totals.baselineDoseUg - plan.totals.optimizedDoseUg)} and {fmtCig(plan.totals.cigarettesAvoided)} cigarette-equivalents avoided,{' '}
            {fmtDec(plan.totals.co2SavedKgWeek, 1)} kg CO₂e saved a week
          </span>
          <Link href="/impact" className="inline-flex items-center gap-1 font-medium text-fg hover:underline">
            See the impact <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </CardFooter>
      </Card>

      {upgrades.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Upgrades worth making" description="These cost money or effort, so they are kept out of today’s totals." />
          <ul className="border-t border-line">
            {upgrades.map((item) => (
              <RoutineRow key={item.id} item={item} members={household.members} why={why.get(item.id)} whyBy={writer} />
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <TipsCard title="Indoor air hacks" icon={<Wind size={15} aria-hidden="true" />} tips={ai?.indoorHacks ?? CURATED_HACKS} ai={ai ? writer : null} />
        <TipsCard title="Sustainable swaps" icon={<Leaf size={15} aria-hidden="true" />} tips={ai?.sustainableSwaps ?? CURATED_SWAPS} ai={ai ? writer : null} />
      </div>

      {history.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Deployments" description="Your recent plans, stored only in this browser." />
          <ul className="border-t border-line">
            {history.map((d, i) => (
              <li key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-5 py-3 text-[13px] last:border-b-0 md:grid-cols-[110px_minmax(0,1fr)_140px_120px_90px]">
                <span className="inline-flex items-center gap-2 font-medium text-fg">
                  <Dot className="bg-green" /> Ready
                </span>
                <span className="truncate text-fg">
                  {d.placeLabel}
                  {i === 0 && <Badge tone="blue" className="ml-2">Current</Badge>}
                </span>
                <span className="hidden text-muted md:block">{d.source === 'gemini' ? d.model ?? 'Gemini' : 'Rules engine'}</span>
                <span className="tabular hidden text-muted md:block">−{Math.round(d.cutPct)}% dose</span>
                <span className="text-right text-subtle">{relativeTime(d.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Routine" description="Your next 24 hours, re-planned for less smog in your lungs and less from your household." actions={actions} />
      <PageBody>{children}</PageBody>
    </>
  );
}

function DeploymentCard({
  building,
  status,
  logs,
  latestAt,
  source,
  model,
  place,
}: {
  building: boolean;
  status: string;
  logs: LogLine[];
  latestAt: string | null;
  source: string | null;
  model: string | null;
  place: string;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const logRef = useRef<HTMLOListElement>(null);
  const showLogs = open || building || status === 'error';

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [logs.length]);

  const state =
    status === 'building'
      ? { dot: 'bg-amber', label: 'Building', pulse: true }
      : status === 'error'
        ? { dot: 'bg-red', label: 'Error', pulse: false }
        : latestAt
          ? { dot: 'bg-green', label: 'Ready', pulse: false }
          : { dot: 'bg-line-strong', label: 'Not deployed', pulse: false };

  return (
    <Card>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-4">
        <div>
          <dt className="text-[13px] text-muted">Status</dt>
          <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-fg" aria-live="polite">
            <Dot className={state.dot} pulse={state.pulse} /> {state.label}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Explained by</dt>
          <dd className="mt-1 text-sm font-medium text-fg">{source === 'gemini' ? model ?? 'Gemini' : source === 'rules' ? 'Rules engine' : 'Not yet'}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Location</dt>
          <dd className="mt-1 truncate text-sm font-medium text-fg">{place}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted">Deployed</dt>
          <dd className="mt-1 text-sm font-medium text-fg">{latestAt ? relativeTime(latestAt) : 'Never'}</dd>
        </div>
      </dl>
      <div className="border-t border-line">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={showLogs}
          aria-controls="build-logs"
          className="flex w-full items-center gap-2 px-5 py-3 text-left text-[13px] font-medium text-fg hover:bg-hover"
        >
          <ChevronRight size={14} aria-hidden="true" className={cn('transition-transform duration-200', showLogs && 'rotate-90')} />
          Build logs
          {building && <Spinner size={13} />}
          <span className="ml-auto text-xs font-normal text-subtle">{logs.length ? `${logs.length} lines` : 'Run a deployment to see logs'}</span>
        </button>
        <AnimatePresence initial={false}>
          {showLogs && logs.length > 0 && (
            <motion.div
              id="build-logs"
              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <ol ref={logRef} className="max-h-64 overflow-auto border-t border-line bg-surface-2 py-2 font-mono text-[12px] leading-6" aria-live="polite">
                {logs.map((l, i) => (
                  <li key={i} className="grid grid-cols-[92px_18px_1fr] gap-2 px-5">
                    <span className="tabular text-subtle">{new Date(l.at).toTimeString().slice(0, 8)}.{String(l.at % 1000).padStart(3, '0')}</span>
                    <LogIcon kind={l.kind} />
                    <span className={cn(l.kind === 'error' ? 'text-red' : l.kind === 'warn' ? 'text-amber' : l.kind === 'ai' ? 'text-blue' : 'text-fg')}>{l.text}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function LogIcon({ kind }: { kind: LogLine['kind'] }) {
  const cls = 'mt-[5px]';
  if (kind === 'ok') return <Check size={13} aria-label="done" className={cn(cls, 'text-green')} />;
  if (kind === 'warn') return <TriangleAlert size={13} aria-label="warning" className={cn(cls, 'text-amber')} />;
  if (kind === 'error') return <CircleAlert size={13} aria-label="error" className={cn(cls, 'text-red')} />;
  if (kind === 'ai') return <Sparkles size={13} aria-label="Gemini" className={cn(cls, 'text-blue')} />;
  return <span aria-hidden="true" className="mt-[11px] ml-[5px] size-1 rounded-full bg-subtle" />;
}

function TipsCard({ title, icon, tips, ai }: { title: string; icon: React.ReactNode; tips: AiTip[]; ai: string | null }) {
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2">{icon} {title}</span>}
        action={<Badge tone={ai ? 'blue' : 'neutral'}>{ai ?? 'Curated'}</Badge>}
      />
      <ul className="space-y-3 px-5 pb-5">
        {tips.map((t) => (
          <li key={t.title} className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium text-fg">{t.title}</p>
            <p className="mt-1 text-[13px] text-muted">{t.detail}</p>
            <p className="mt-2 text-xs font-medium text-green">{t.impact}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
