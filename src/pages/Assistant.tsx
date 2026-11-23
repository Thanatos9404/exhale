import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Globe, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { ParticleOrb } from '@/components/ParticleOrb';
import { Button } from '@/components/ui/Button';
import { Badge, Card, CardHeader, Dot, Switch } from '@/components/ui/primitives';
import { useCommandMenu } from '@/components/shell/CommandMenu';
import { useHealth, useLocalPlan } from '@/hooks/useAir';
import { useAppState } from '@/state/AppState';
import { streamChat } from '@/lib/api';
import type { ChatMessage } from '@/lib/apiTypes';
import { KEYS, readStored, removeStored, writeStored } from '@/lib/storage';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';

const Markdown = lazy(() => import('react-markdown'));

const MAX_CHARS = 2000;
const parseChat = (raw: unknown) => {
  const r = z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(8000) })).max(30).safeParse(raw);
  return r.success ? r.data : null;
};

export default function Assistant() {
  const { household, place } = useAppState();
  const { plan } = useLocalPlan();
  const health = useHealth();
  const { takePendingQuestion, pendingQuestion } = useCommandMenu();
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStored(KEYS.chat, parseChat) ?? []);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, streaming]);

  const send = useCallback(
    async (text: string, useSearch = search) => {
      const q = text.trim().slice(0, MAX_CHARS);
      if (!q || streaming !== null) return;
      const history: ChatMessage[] = [...messages, { role: 'user', text: q }];
      setMessages(history);
      setDraft('');
      setStreaming('');
      setAnnounce('Exhale is answering');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const { text: answer } = await streamChat(
          { place, household, messages: history.slice(-16), search: useSearch },
          (soFar) => setStreaming(soFar),
          ctrl.signal,
        );
        const next: ChatMessage[] = [...history, { role: 'model', text: answer || 'No answer came back. Please try again.' }];
        setMessages(next);
        writeStored(KEYS.chat, next.slice(-30));
        setAnnounce('Answer ready');
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setAnnounce('Stopped');
        } else {
          toast.error(err instanceof Error ? err.message : 'The assistant is unavailable');
          setMessages(messages);
          setDraft(q);
        }
      } finally {
        setStreaming(null);
        abortRef.current = null;
      }
    },
    [messages, streaming, place, household, search],
  );

  // A question handed over from the command menu.
  useEffect(() => {
    if (!pendingQuestion) return;
    const q = takePendingQuestion();
    if (q) void send(q);
  }, [pendingQuestion, takePendingQuestion, send]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const sensitive = household.members.find((m) => m.conditions.length > 0 || m.ageGroup === 'child') ?? household.members[0]!;
  const suggestions = [
    { q: `When can ${sensitive.name} safely go outside today?`, search: false },
    { q: 'Is my commute better by metro or car today, and by how much?', search: false },
    { q: 'How do I build a box-fan air filter at home?', search: false },
    { q: 'Why is the air worst at night and early morning in winter?', search: false },
    { q: `What pollution restrictions are in force in ${place.label.split(',')[0]} today?`, search: true },
  ];

  const aiOn = health.data?.ai === true;

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask anything about your air. Answers use your live readings, your plan and your household, and quote real numbers."
        actions={
          messages.length > 0 ? (
            <Button
              leading={<Trash2 size={14} aria-hidden="true" />}
              onClick={() => {
                setMessages([]);
                removeStored(KEYS.chat);
              }}
            >
              Clear chat
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex min-h-[560px] flex-col">
            <div className="sr-only" role="status" aria-live="polite">
              {announce}
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6" role="log" aria-label="Conversation">
              {messages.length === 0 && streaming === null ? (
                <div className="mx-auto flex max-w-[560px] flex-col items-center pt-6 text-center">
                  <div className="text-fg">
                    <ParticleOrb size={72} active />
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-fg">Ask about your air</h2>
                  <p className="mt-1 text-[13px] text-muted">
                    {plan ? `${plan.placeLabel}: AQI ${plan.risk.aqi}, ${plan.risk.label.toLowerCase()}.` : 'Loading live data…'} I know your household and today’s plan.
                  </p>
                  <ul className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                    {suggestions.map((s) => (
                      <li key={s.q}>
                        <button
                          type="button"
                          onClick={() => {
                            if (s.search) setSearch(true);
                            void send(s.q, s.search || search);
                          }}
                          className="press flex h-full w-full items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-[13px] text-fg transition-colors hover:bg-hover"
                        >
                          {s.search && <Globe size={13} aria-label="Uses web search" className="mt-0.5 shrink-0 text-blue" />}
                          {s.q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ol className="mx-auto flex max-w-[720px] flex-col gap-6">
                  {messages.map((m, i) => (
                    <Message key={i} message={m} />
                  ))}
                  {streaming !== null && <Message message={{ role: 'model', text: streaming }} streaming />}
                </ol>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={onSubmit} className="border-t border-line p-3 md:p-4">
              <div className="rounded-xl border border-line-strong bg-surface transition-[border-color,box-shadow] focus-within:border-fg focus-within:ring-2 focus-within:ring-[color-mix(in_oklab,var(--focus)_30%,transparent)]">
                <label htmlFor="ask" className="sr-only">
                  Ask Exhale
                </label>
                <textarea
                  ref={inputRef}
                  id="ask"
                  rows={2}
                  maxLength={MAX_CHARS}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="When should we open the windows today?"
                  className="block max-h-40 min-h-[56px] w-full resize-y bg-transparent px-3 pt-3 text-sm text-fg outline-none placeholder:text-subtle"
                />
                <div className="flex items-center gap-3 px-2 pb-2">
                  <div className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted">
                    <Switch id="web-search" checked={search} onChange={setSearch} label="Search the web for current advisories" />
                    <label htmlFor="web-search" className="inline-flex cursor-pointer items-center gap-1.5">
                      <Globe size={13} aria-hidden="true" /> Web search
                    </label>
                  </div>
                  <span className="tabular ml-auto text-xs text-subtle">
                    {draft.length > MAX_CHARS * 0.8 ? `${draft.length}/${MAX_CHARS}` : ''}
                  </span>
                  {streaming !== null ? (
                    <Button size="sm" variant="secondary" onClick={() => abortRef.current?.abort()} leading={<Square size={12} aria-hidden="true" />}>
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" type="submit" disabled={!draft.trim()} aria-label="Send question" className="size-8 rounded-full px-0">
                      <ArrowUp size={16} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 px-1 text-[11px] text-subtle">General guidance, not medical advice. For trouble breathing, seek care now.</p>
            </form>
          </Card>

          <Card className="h-fit">
            <CardHeader title="What Exhale knows" description="Sent with your question, used only to answer it. Nothing is stored on a server." />
            <dl className="space-y-3 px-5 pb-5 text-[13px]">
              <Row label="Model" value={<span className="inline-flex items-center gap-1.5"><Dot className={aiOn ? 'bg-green' : 'bg-amber'} />{aiOn ? health.data?.model : 'Rules engine (no Gemini key)'}</span>} />
              <Row label="Place" value={place.label} />
              {plan && (
                <>
                  <Row label="Air now" value={`AQI ${plan.risk.aqi} · PM2.5 ${fmtInt(plan.current.pm25 ?? 0)} µg/m³`} />
                  <Row label="Smog lid" value={plan.lid.spans[0] ? `${plan.lid.spans[0].start} to ${plan.lid.spans[0].end} at ${plan.lid.spans[0].minBlh} m` : 'None'} />
                  <Row label="Cleanest hour" value={plan.cleanWindow ? `${plan.cleanWindow.start} · ${plan.cleanWindow.pm25} µg/m³` : 'n/a'} />
                  <Row label="Plan" value={`${plan.items.length} actions · −${Math.round(plan.totals.exposureCutPct)}% dose`} />
                </>
              )}
              <Row
                label="Household"
                value={
                  <span className="flex flex-wrap gap-1">
                    {household.members.map((m) => (
                      <Badge key={m.id}>
                        {m.name} · {m.ageGroup}
                        {m.conditions.length ? `, ${m.conditions.join(', ')}` : ''}
                      </Badge>
                    ))}
                  </span>
                }
              />
            </dl>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{value}</dd>
    </div>
  );
}

function Message({ message, streaming = false }: { message: ChatMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-hover px-4 py-2.5 text-sm whitespace-pre-wrap text-fg">{message.text}</div>
      </li>
    );
  }
  return (
    <li className="flex gap-3" aria-busy={streaming || undefined}>
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-fg">
        <ParticleOrb size={18} active={streaming} />
      </span>
      <div className={cn('prose-exhale min-w-0 flex-1 text-fg')}>
        {message.text ? (
          <Suspense fallback={<p className="whitespace-pre-wrap">{message.text}</p>}>
            <Markdown
              skipHtml
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {message.text}
            </Markdown>
          </Suspense>
        ) : (
          <p className="text-muted">Thinking with your live data…</p>
        )}
        {streaming && message.text && <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-[exhale-caret_1s_steps(1)_infinite] bg-fg" />}
      </div>
    </li>
  );
}
