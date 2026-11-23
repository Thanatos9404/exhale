// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as log from './log';

// Built at runtime so no key-shaped literal sits in the source.
const fakeGoogleKey = `AIza${'x'.repeat(35)}`;
const fakeAnthropicKey = `sk-ant-${'y'.repeat(20)}`;

describe('server log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefixes messages and passes the detail through', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('k1/model unavailable:', '503 overloaded');
    log.warn('budget reached');
    expect(warn).toHaveBeenNthCalledWith(1, '[exhale] k1/model unavailable:', '503 overloaded');
    expect(warn).toHaveBeenNthCalledWith(2, '[exhale] budget reached');
  });

  it('logs errors through console.error with the same prefix', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('unhandled error', 'boom');
    expect(error).toHaveBeenCalledWith('[exhale] unhandled error', 'boom');
  });

  it('masks anything shaped like an API key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn(`call with ${fakeGoogleKey} failed`, `https://x.test/v1?key=${fakeGoogleKey}&a=1`);
    const [message, detail] = warn.mock.calls[0]!;
    expect(String(message)).not.toContain(fakeGoogleKey);
    expect(detail).toBe('https://x.test/v1?key=[redacted]&a=1');
    expect(log.redact(`token ${fakeAnthropicKey}`)).toBe('token [redacted]');
  });

  it('describes errors by message only, optionally truncated', () => {
    expect(log.errorMessage(new Error('abcdef'), 3)).toBe('abc');
    expect(log.errorMessage(new Error('abcdef'))).toBe('abcdef');
    expect(log.errorMessage({ secret: 'x' })).toBe('unknown');
  });
});
