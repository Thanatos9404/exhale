import { describe, expect, it } from 'vitest';
import { dayHourLabel, fmtCig, fmtDec, fmtDose, fmtInt, hourLabel, relativeTime } from './format';

describe('fmtInt and fmtDec', () => {
  it('groups digits the Indian way', () => {
    expect(fmtInt(124_000)).toBe('1,24,000');
    expect(fmtInt(999.5)).toBe('1,000');
    expect(fmtDec(1234.56)).toBe('1,234.6');
    expect(fmtDec(2, 2)).toBe('2.00');
  });
});

describe('fmtCig', () => {
  it('shows two decimals below one cigarette, one below ten and none from ten up', () => {
    expect(fmtCig(0.349)).toBe('0.35');
    expect(fmtCig(0.999)).toBe('1.00');
    expect(fmtCig(1)).toBe('1.0');
    expect(fmtCig(2.44)).toBe('2.4');
    expect(fmtCig(9.96)).toBe('10.0');
    expect(fmtCig(10)).toBe('10');
    expect(fmtCig(137.6)).toBe('138');
  });

  it('picks the precision from the size of the number, whatever its sign', () => {
    expect(fmtCig(0)).toBe('0.00');
    expect(fmtCig(-0.25)).toBe('-0.25');
    expect(fmtCig(-2.44)).toBe('-2.4');
    expect(fmtCig(-12.3)).toBe('-12');
  });
});

describe('fmtDose', () => {
  it('switches from micrograms to milligrams at 10,000 µg', () => {
    expect(fmtDose(1240)).toBe('1,240 µg');
    expect(fmtDose(9999)).toBe('9,999 µg');
    expect(fmtDose(10_000)).toBe('10.0 mg');
    expect(fmtDose(-12_340)).toBe('-12.3 mg');
    expect(fmtDose(0)).toBe('0 µg');
  });
});

describe('time labels', () => {
  it('reads the wall-clock hour without shifting it to another zone', () => {
    expect(hourLabel('2026-11-23T06:00')).toBe('06:00');
    expect(dayHourLabel('2026-11-23T06:00')).toBe('Mon 06:00');
    expect(dayHourLabel('2026-11-22T23:00')).toBe('Sun 23:00');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('steps from "just now" through minutes and hours to days', () => {
    expect(relativeTime(ago(0), now)).toBe('just now');
    expect(relativeTime(ago(59), now)).toBe('just now');
    expect(relativeTime(ago(60), now)).toBe('1m ago');
    expect(relativeTime(ago(59 * 60), now)).toBe('59m ago');
    expect(relativeTime(ago(60 * 60), now)).toBe('1h ago');
    expect(relativeTime(ago(23 * 3600), now)).toBe('23h ago');
    expect(relativeTime(ago(24 * 3600), now)).toBe('1d ago');
    expect(relativeTime(ago(9 * 24 * 3600), now)).toBe('9d ago');
  });

  it('treats a timestamp from a clock that runs ahead as just now', () => {
    expect(relativeTime(ago(-300), now)).toBe('just now');
  });
});
