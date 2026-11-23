import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreaChart } from './charts/AreaChart';
import { Segmented, Switch } from './ui/primitives';
import { Button } from './ui/Button';
import { ImpactChips, RoutineRow } from './routine';
import { InversionDiagram, lidToY } from './InversionDiagram';
import { axeViolations } from '@/test/render';
import { buildPlan } from '@/lib/planner/engine';
import { DEFAULT_HOUSEHOLD } from '@/lib/profile/schema';
import { makeSnapshot } from '@/test/fixtures';

const plan = buildPlan(DEFAULT_HOUSEHOLD, makeSnapshot(), new Date('2026-11-23T00:00:00Z'));

describe('AreaChart', () => {
  const data = Array.from({ length: 24 }, (_, i) => ({ label: `${String(i).padStart(2, '0')}:00`, value: 50 + i }));

  it('is an accessible image with a summary', () => {
    render(<AreaChart data={data} unit="µg/m³" ariaLabel="PM2.5 today" />);
    const chart = screen.getByRole('img', { name: /PM2.5 today\. Peak 73/ });
    expect(chart).toHaveAttribute('tabindex', '0');
  });

  it('reads hourly values with the arrow keys', () => {
    render(<AreaChart data={data} nowIndex={3} unit="µg/m³" ariaLabel="PM2.5 today" />);
    const chart = screen.getByRole('img');
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByText('04:00: 54 µg/m³')).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: 'End' });
    expect(screen.getByText('23:00: 73 µg/m³')).toBeInTheDocument();
  });
});

describe('form primitives', () => {
  it('Segmented exposes radio semantics and reports changes', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Range" value="a" onChange={onChange} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Switch toggles and is labelled', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Windows open" />);
    const sw = screen.getByRole('switch', { name: 'Windows open' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Button shows a busy state while loading and blocks clicks', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Deploy</Button>);
    const btn = screen.getByRole('button', { name: 'Deploy' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('RoutineRow', () => {
  const item = plan.items.find((i) => i.id === 'coil')!;

  it('expands to show the reasoning and impact', async () => {
    render(<ul><RoutineRow item={item} members={DEFAULT_HOUSEHOLD.members} why="Coils fill the bedroom with smoke." /></ul>);
    const toggle = screen.getByRole('button', { name: new RegExp(item.title) });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Coils fill the bedroom with smoke.')).toBeInTheDocument();
    expect(screen.getByText(/Liu et al/)).toBeInTheDocument();
  });

  it('marks an action done', async () => {
    const onToggle = vi.fn();
    render(<ul><RoutineRow item={item} members={DEFAULT_HOUSEHOLD.members} onToggleDone={onToggle} /></ul>);
    await userEvent.click(screen.getByRole('button', { name: `Mark "${item.title}" done` }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ul>{plan.items.slice(0, 4).map((i) => <RoutineRow key={i.id} item={i} members={DEFAULT_HOUSEHOLD.members} onToggleDone={() => {}} />)}</ul>);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('labels impact chips with units', () => {
    render(<ImpactChips item={plan.items.find((i) => i.id === 'commute')!} />);
    expect(screen.getByText(/kg CO₂e/)).toBeInTheDocument();
  });
});

describe('InversionDiagram', () => {
  it('describes the lid for screen readers', () => {
    render(<InversionDiagram blh={45} wind={3} vc={38} dispersion="stagnant" />);
    expect(screen.getByRole('img', { name: 'Temperature inversion diagram' })).toBeInTheDocument();
    expect(screen.getByText(/warm-air lid sits 45 metres/i)).toBeInTheDocument();
  });

  it('places a lower lid closer to the ground', () => {
    expect(lidToY(20)).toBeGreaterThan(lidToY(1500));
  });
});
