import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Impact, RoutineItem, RoutineKind, RoutineStatus } from '@/lib/planner/engine';
import { ImpactChips, KIND_ICON, RoutineIcon, STATUS_META, StatusLabel } from './routineMeta';

const STATUSES: RoutineStatus[] = ['go', 'caution', 'avoid'];
const KINDS: RoutineKind[] = ['ventilate', 'exercise', 'commute', 'protect', 'home', 'upgrade'];
const NO_IMPACT: Impact = {
  doseSavedUg: 0,
  exposureCutPct: 0,
  cigarettesAvoided: 0,
  co2SavedKg: 0,
};

const item = (patch: Partial<RoutineItem> = {}, impact: Partial<Impact> = {}): RoutineItem => ({
  id: 'ventilate',
  kind: 'ventilate',
  status: 'go',
  time: '13:00',
  endTime: '14:00',
  title: 'Air the home at 13:00',
  detail: 'PM2.5 is lowest then.',
  memberIds: ['you'],
  impact: { ...NO_IMPACT, ...impact },
  freeAction: true,
  ...patch,
});

/** The icon drawn for an item, by its lucide name. */
function iconName(routineItem: RoutineItem): string {
  const { container, unmount } = render(<RoutineIcon item={routineItem} />);
  const svg = container.querySelector('svg')!;
  const name = [...svg.classList].find((c) => c.startsWith('lucide-')) ?? '';
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  unmount();
  return name;
}

describe('routine status', () => {
  it('gives every status a label and a dot colour of its own', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([...STATUSES].sort());
    expect(new Set(STATUSES.map((s) => STATUS_META[s].label)).size).toBe(STATUSES.length);
    expect(new Set(STATUSES.map((s) => STATUS_META[s].dot)).size).toBe(STATUSES.length);
  });

  it('colours the verdicts like a traffic light', () => {
    expect(STATUS_META.go.dot).toContain('green');
    expect(STATUS_META.caution.dot).toContain('amber');
    expect(STATUS_META.avoid.dot).toContain('red');
  });

  it.each(STATUSES)('shows the label of "%s" in words, not by colour alone', (status) => {
    render(<StatusLabel status={status} />);
    expect(screen.getByText(STATUS_META[status].label)).toBeInTheDocument();
  });
});

describe('routine icons', () => {
  it('has an icon for every kind of action', () => {
    expect(Object.keys(KIND_ICON).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) expect(KIND_ICON[kind]).toBeDefined();
  });

  it('draws a different default icon for each kind', () => {
    const names = KINDS.map((kind) => iconName(item({ kind, title: 'Plain title' })));
    expect(new Set(names).size).toBe(KINDS.length);
    for (const name of names) expect(name).toMatch(/^lucide-/);
  });

  it('shows a flame for home actions about cooking or heaters', () => {
    const house = iconName(item({ kind: 'home', title: 'Skip the incense tonight' }));
    const cooking = iconName(item({ kind: 'home', title: 'Cook with the lid on' }));
    expect(cooking).not.toBe(house);
    expect(iconName(item({ kind: 'home', title: 'Swap the coal HEATER' }))).toBe(cooking);
  });

  it('shows a fan for home actions about the purifier', () => {
    const house = iconName(item({ kind: 'home', title: 'Skip the incense tonight' }));
    const fan = iconName(item({ kind: 'home', title: 'Run the Purifier on high' }));
    expect(fan).not.toBe(house);
    expect(fan).not.toBe(iconName(item({ kind: 'home', title: 'Cook with the lid on' })));
  });

  it('keeps the kind icon when another kind of action mentions cooking or a purifier', () => {
    const upgrade = iconName(item({ kind: 'upgrade', title: 'Plain title' }));
    expect(iconName(item({ kind: 'upgrade', title: 'Buy a purifier' }))).toBe(upgrade);
    const ventilate = iconName(item({ kind: 'ventilate', title: 'Plain title' }));
    expect(iconName(item({ kind: 'ventilate', title: 'Air out after cooking' }))).toBe(ventilate);
  });
});

describe('ImpactChips', () => {
  const chips = (impact: Partial<Impact>, compact = false) => {
    const { container } = render(<ImpactChips item={item({}, impact)} compact={compact} />);
    return [...container.querySelectorAll('[title]')].map((el) => el.textContent);
  };

  it('shows dose, cigarettes and CO2e saved, each with its unit', () => {
    const texts = chips({ doseSavedUg: 1240, cigarettesAvoided: 0.35, co2SavedKg: 2.44 });
    expect(texts).toEqual(['−1,240 µg', '−0.35 cig', '−2.4 kg CO₂e']);
  });

  it('switches a large dose to milligrams', () => {
    expect(chips({ doseSavedUg: 12_400 })).toEqual(['−12.4 mg']);
  });

  it('explains each chip in its tooltip', () => {
    render(
      <ImpactChips item={item({}, { doseSavedUg: 500, cigarettesAvoided: 1.2, co2SavedKg: 3 })} />,
    );
    expect(screen.getByTitle('Particulate not inhaled today')).toHaveTextContent('−500 µg');
    expect(screen.getByTitle(/Cigarette-equivalents avoided/)).toHaveTextContent('−1.2 cig');
    expect(screen.getByTitle('CO2e saved per day')).toHaveTextContent('−3.0 kg CO₂e');
  });

  it('leaves out a saving of zero', () => {
    expect(chips({ doseSavedUg: 800 })).toEqual(['−800 µg']);
    expect(chips({ co2SavedKg: 1.5 })).toEqual(['−1.5 kg CO₂e']);
  });

  it('leaves out a cigarette saving too small to show as 0.01', () => {
    expect(chips({ doseSavedUg: 5, cigarettesAvoided: 0.004 })).toEqual(['−5 µg']);
    expect(chips({ doseSavedUg: 5, cigarettesAvoided: 0.006 })).toEqual(['−5 µg', '−0.01 cig']);
  });

  it('drops the cigarette chip in compact rows', () => {
    const impact = { doseSavedUg: 1240, cigarettesAvoided: 0.35, co2SavedKg: 2.44 };
    expect(chips(impact, true)).toEqual(['−1,240 µg', '−2.4 kg CO₂e']);
  });

  it('calls an action with no measurable saving protective', () => {
    render(<ImpactChips item={item()} />);
    expect(screen.getByText('Protective')).toBeInTheDocument();
  });

  it('calls a cigarette-only saving protective in compact rows, where its chip is hidden', () => {
    render(<ImpactChips item={item({}, { cigarettesAvoided: 0.5 })} compact />);
    expect(screen.getByText('Protective')).toBeInTheDocument();
    expect(screen.queryByText(/cig/)).not.toBeInTheDocument();
  });
});
