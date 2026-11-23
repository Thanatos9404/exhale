import { describe, expect, it } from 'vitest';
import { deployButtonLabel, explainedByLabel, providerLabel, statusIndicator } from './routineView';

describe('routine view labels', () => {
  it('names every provider, preferring the reported model id', () => {
    expect(providerLabel('gemini', 'gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
    expect(providerLabel('gemini', null)).toBe('Gemini');
    expect(providerLabel('claude', 'claude-haiku-5-5')).toBe('claude-haiku-5-5');
    expect(providerLabel('claude', null)).toBe('Claude Haiku');
    expect(providerLabel('rules', null)).toBe('Rules engine');
  });

  it('credits the Claude fallback instead of the rules engine', () => {
    expect(explainedByLabel('claude', 'claude-haiku-5-5')).toBe('claude-haiku-5-5');
    expect(explainedByLabel(null, null)).toBe('Not yet');
  });

  it('labels the deploy button for each state', () => {
    expect(deployButtonLabel(true, false)).toBe('Deploying…');
    expect(deployButtonLabel(false, false)).toBe('Deploy with Gemini');
    expect(deployButtonLabel(false, true)).toBe('Redeploy with Gemini');
  });

  it('maps run status to a readout', () => {
    expect(statusIndicator('building', null)).toMatchObject({ label: 'Building', pulse: true });
    expect(statusIndicator('error', null).label).toBe('Error');
    expect(statusIndicator('idle', '2026-11-24T08:00:00Z').label).toBe('Ready');
    expect(statusIndicator('idle', null).label).toBe('Not deployed');
  });
});
