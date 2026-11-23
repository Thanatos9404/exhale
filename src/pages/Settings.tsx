import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageBody, PageHeader } from '@/components/shell/Shell';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter, Field, Segmented, Switch, inputClass } from '@/components/ui/primitives';
import { useAppState } from '@/state/AppState';
import { householdSchema, type Household, type Member } from '@/lib/profile/schema';
import { MODE_LABEL, type CommuteMode } from '@/lib/science/commute';
import { PURIFIER_CADR } from '@/lib/science/indoor';
import { fmtHour } from '@/lib/science/meteo';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'people', label: 'People' },
  { id: 'commute', label: 'Commute' },
  { id: 'home', label: 'Home' },
  { id: 'data', label: 'Data' },
] as const;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const CONDITIONS: { value: Member['conditions'][number]; label: string }[] = [
  { value: 'asthma', label: 'Asthma' },
  { value: 'copd', label: 'COPD' },
  { value: 'heart', label: 'Heart condition' },
  { value: 'pregnancy', label: 'Pregnant' },
];

type Errors = Record<string, string>;

function validate(h: Household): Errors {
  const r = householdSchema.safeParse(h);
  if (r.success) return {};
  const out: Errors = {};
  for (const issue of r.error.issues) out[issue.path.join('.')] = issue.message;
  return out;
}

export default function Settings() {
  const { household, setHousehold, resetHousehold, clearLocalData } = useAppState();
  const [draft, setDraft] = useState<Household>(household);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setDraft(household), [household]);

  const errors = useMemo(() => validate(draft), [draft]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(household);
  const valid = Object.keys(errors).length === 0;

  const save = () => {
    if (!valid) {
      toast.error('Fix the highlighted fields first');
      return;
    }
    const parsed = householdSchema.parse(draft);
    setHousehold(parsed);
    toast.success('Household saved. Your plan has been recalculated.');
  };

  const patch = (p: Partial<Household>) => setDraft((d) => ({ ...d, ...p }));
  const patchHome = (p: Partial<Household['home']>) => setDraft((d) => ({ ...d, home: { ...d.home, ...p } }));
  const patchCommute = (p: Partial<Household['commute']>) => setDraft((d) => ({ ...d, commute: { ...d.commute, ...p } }));
  const patchMember = (id: string, p: Partial<Member>) => setDraft((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...p } : m)) }));

  const footer = (hint: string) => (
    <CardFooter>
      <span>{hint}</span>
      <Button size="sm" variant="primary" onClick={save} disabled={!dirty}>
        Save
      </Button>
    </CardFooter>
  );

  return (
    <>
      <PageHeader title="Settings" description="Your household profile drives every recommendation. It is stored only in this browser." />
      <PageBody>
        <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="md:sticky md:top-20 md:self-start">
            <ul className="scrollbar-none flex gap-1 overflow-x-auto md:flex-col">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted hover:bg-hover hover:text-fg">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-6">
            <Section id="general" title="General" description="How your household appears and which AQI scale you read.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Household name" error={errors['name']}>
                  {(id, d) => <input id={id} aria-describedby={d} aria-invalid={Boolean(errors['name'])} className={inputClass} value={draft.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })} />}
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-muted">AQI standard</span>
                  <Segmented label="AQI standard" value={draft.standard} onChange={(v) => patch({ standard: v })} options={[{ value: 'in', label: 'India NAQI' }, { value: 'us', label: 'US EPA' }]} />
                </div>
              </div>
              {footer('Names are labels only; use anything you like.')}
            </Section>

            <Section id="people" title="People" description="Age and health conditions set each person's outdoor limit.">
              <ul className="space-y-4">
                {draft.members.map((m, i) => (
                  <li key={m.id} className="rounded-lg border border-line p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-fg">Person {i + 1}</span>
                      <Button
                        size="sm"
                        variant="tertiary"
                        leading={<Trash2 size={13} aria-hidden="true" />}
                        disabled={draft.members.length <= 1}
                        onClick={() => setDraft((d) => ({ ...d, members: d.members.filter((x) => x.id !== m.id), commute: d.commute.memberId === m.id ? { ...d.commute, memberId: d.members.find((x) => x.id !== m.id)!.id } : d.commute }))}
                        aria-label={`Remove ${m.name || `person ${i + 1}`}`}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Name" error={errors[`members.${i}.name`]}>
                        {(id, d) => <input id={id} aria-describedby={d} aria-invalid={Boolean(errors[`members.${i}.name`])} className={inputClass} value={m.name} maxLength={32} onChange={(e) => patchMember(m.id, { name: e.target.value })} />}
                      </Field>
                      <Field label="Age group">
                        {(id) => (
                          <select id={id} className={inputClass} value={m.ageGroup} onChange={(e) => patchMember(m.id, { ageGroup: e.target.value as Member['ageGroup'] })}>
                            <option value="child">Child (under 12)</option>
                            <option value="teen">Teen</option>
                            <option value="adult">Adult</option>
                            <option value="senior">Senior (60+)</option>
                          </select>
                        )}
                      </Field>
                      <Field label="Daytime">
                        {(id) => (
                          <select id={id} className={inputClass} value={m.daytime} onChange={(e) => patchMember(m.id, { daytime: e.target.value as Member['daytime'] })}>
                            <option value="home">At home</option>
                            <option value="office">At an office</option>
                            <option value="school">At school</option>
                          </select>
                        )}
                      </Field>
                      <Field label="Exercise">
                        {(id) => (
                          <select id={id} className={inputClass} value={m.exercise} onChange={(e) => patchMember(m.id, { exercise: e.target.value as Member['exercise'] })}>
                            <option value="none">None</option>
                            <option value="walk">Walk</option>
                            <option value="run">Run</option>
                            <option value="cycle">Cycle</option>
                            <option value="yoga">Outdoor yoga</option>
                          </select>
                        )}
                      </Field>
                      <Field label="Usually at">
                        {(id) => (
                          <select id={id} className={inputClass} value={m.exerciseHour} disabled={m.exercise === 'none'} onChange={(e) => patchMember(m.id, { exerciseHour: Number(e.target.value) })}>
                            {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                          </select>
                        )}
                      </Field>
                      <Field label="Minutes" error={errors[`members.${i}.exerciseMinutes`]}>
                        {(id, d) => <input id={id} aria-describedby={d} type="number" min={0} max={240} className={inputClass} value={m.exerciseMinutes} disabled={m.exercise === 'none'} onChange={(e) => patchMember(m.id, { exerciseMinutes: Number(e.target.value) })} />}
                      </Field>
                    </div>
                    <fieldset className="mt-4">
                      <legend className="mb-2 text-[13px] font-medium text-muted">Health conditions</legend>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {CONDITIONS.map((c) => (
                          <label key={c.value} className="inline-flex items-center gap-2 text-sm text-fg">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--fg)]"
                              checked={m.conditions.includes(c.value)}
                              onChange={(e) => patchMember(m.id, { conditions: e.target.checked ? [...m.conditions, c.value] : m.conditions.filter((x) => x !== c.value) })}
                            />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Button
                  size="sm"
                  leading={<Plus size={14} aria-hidden="true" />}
                  disabled={draft.members.length >= 8}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      members: [...d.members, { id: `p-${Date.now().toString(36)}`, name: `Person ${d.members.length + 1}`, ageGroup: 'adult', conditions: [], daytime: 'home', exercise: 'none', exerciseHour: 7, exerciseMinutes: 30 }],
                    }))
                  }
                >
                  Add person
                </Button>
              </div>
              {footer(`${draft.members.length} of 8 people`)}
            </Section>

            <Section id="commute" title="Commute" description="Compared against every other mode for dose, carbon and time.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Who commutes">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.commute.memberId} onChange={(e) => patchCommute({ memberId: e.target.value })}>
                      {draft.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Usual mode">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.commute.mode} onChange={(e) => patchCommute({ mode: e.target.value as CommuteMode })}>
                      {(Object.keys(MODE_LABEL) as CommuteMode[]).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Distance each way (km)" error={errors['commute.distanceKm']}>
                  {(id, d) => <input id={id} aria-describedby={d} type="number" min={0} max={100} step={0.5} className={inputClass} value={draft.commute.distanceKm} onChange={(e) => patchCommute({ distanceKm: Number(e.target.value) })} />}
                </Field>
                <Field label="Leaves at">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.commute.departHour} onChange={(e) => patchCommute({ departHour: Number(e.target.value) })}>
                      {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Returns at">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.commute.returnHour} onChange={(e) => patchCommute({ returnHour: Number(e.target.value) })}>
                      {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Days a week" error={errors['commute.daysPerWeek']}>
                  {(id, d) => <input id={id} aria-describedby={d} type="number" min={0} max={7} className={inputClass} value={draft.commute.daysPerWeek} onChange={(e) => patchCommute({ daysPerWeek: Number(e.target.value) })} />}
                </Field>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ToggleRow label="Flexible hours" hint="Lets the plan shift your departure." checked={draft.commute.flexible} onChange={(v) => patchCommute({ flexible: v })} />
                <ToggleRow label="Owns an N95 or FFP2" hint="Already counted in today’s dose." checked={draft.commute.hasN95} onChange={(v) => patchCommute({ hasN95: v })} />
              </div>
              {footer('Times are local to the selected city.')}
            </Section>

            <Section id="home" title="Home" description="Feeds the indoor air model for every hour spent at home.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Area kept closed (m²)" hint="A 2BHK is about 45 to 60 m²." error={errors['home.areaM2']}>
                  {(id, d) => <input id={id} aria-describedby={d} type="number" min={5} max={200} className={inputClass} value={draft.home.areaM2} onChange={(e) => patchHome({ areaM2: Number(e.target.value) })} />}
                </Field>
                <Field label="Air purifier">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.home.purifier} onChange={(e) => patchHome({ purifier: e.target.value as Household['home']['purifier'] })}>
                      <option value="none">None</option>
                      <option value="small">Small ({PURIFIER_CADR.small} m³/h)</option>
                      <option value="medium">Medium ({PURIFIER_CADR.medium} m³/h)</option>
                      <option value="large">Large ({PURIFIER_CADR.large} m³/h)</option>
                      <option value="diy">DIY box-fan filter</option>
                    </select>
                  )}
                </Field>
                <Field label="Usually air the house at">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.home.airingHour} onChange={(e) => patchHome({ airingHour: Number(e.target.value) })}>
                      {HOURS.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label="Cooking fuel">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.home.cooking} onChange={(e) => patchHome({ cooking: e.target.value as Household['home']['cooking'] })}>
                      <option value="lpg">LPG or piped gas</option>
                      <option value="electric">Electric or induction</option>
                      <option value="biomass">Wood, dung or coal (chulha)</option>
                    </select>
                  )}
                </Field>
                <Field label="Heating">
                  {(id) => (
                    <select id={id} className={inputClass} value={draft.home.heating} onChange={(e) => patchHome({ heating: e.target.value as Household['home']['heating'] })}>
                      <option value="none">None</option>
                      <option value="electric">Electric heater</option>
                      <option value="gas">Gas heater</option>
                      <option value="wood">Wood fire</option>
                      <option value="coal">Coal (angithi)</option>
                    </select>
                  )}
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-muted">Draught-proofing</span>
                  <Segmented label="Draught-proofing" value={draft.home.ventilation} onChange={(v) => patchHome({ ventilation: v })} options={[{ value: 'sealed', label: 'Sealed' }, { value: 'normal', label: 'Typical' }, { value: 'leaky', label: 'Leaky' }]} />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ToggleRow label="Kitchen exhaust or chimney" checked={draft.home.kitchenExhaust} onChange={(v) => patchHome({ kitchenExhaust: v })} />
                <ToggleRow label="Incense or dhoop" checked={draft.home.incense} onChange={(v) => patchHome({ incense: v })} />
                <ToggleRow label="Mosquito coil at night" checked={draft.home.mosquitoCoil} onChange={(v) => patchHome({ mosquitoCoil: v })} />
                <ToggleRow label="Someone smokes indoors" checked={draft.home.indoorSmoking} onChange={(v) => patchHome({ indoorSmoking: v })} />
              </div>
              {footer('Indoor sources often matter more than the street on a closed-up winter night.')}
            </Section>

            <section id="data" aria-labelledby="data-title" className="scroll-mt-24 rounded-xl border border-red/40 bg-surface">
              <div className="p-5">
                <h2 id="data-title" className="text-[15px] font-semibold text-fg">Data</h2>
                <p className="mt-1 text-[13px] text-muted">
                  Exhale keeps your profile, chat and plans in this browser’s storage. Questions and plans are sent to the server only to compute an answer, then discarded.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-red/30 bg-red-soft px-5 py-3">
                <Button
                  size="sm"
                  onClick={() => {
                    resetHousehold();
                    toast.success('Sample household restored');
                  }}
                >
                  Restore sample household
                </Button>
                <Button
                  size="sm"
                  variant="error"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    clearLocalData();
                    setConfirmDelete(false);
                    toast.success('All local data deleted');
                  }}
                >
                  {confirmDelete ? 'Click again to delete everything' : 'Delete local data'}
                </Button>
              </div>
            </section>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  const kids = Array.isArray(children) ? children : [children];
  const footer = kids[kids.length - 1];
  const body = kids.slice(0, -1);
  return (
    <Card id={id} className="scroll-mt-24" aria-labelledby={`${id}-title`} role="region">
      <div className="p-5">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold text-fg">
          {title}
        </h2>
        <p className="mt-1 mb-5 text-[13px] text-muted">{description}</p>
        {body}
      </div>
      {footer}
    </Card>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5')}>
      <div>
        <div className="text-sm text-fg">{label}</div>
        {hint && <div className="text-xs text-subtle">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
