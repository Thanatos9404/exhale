import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYS, readStored, removeStored, writeStored } from './storage';
import { DEFAULT_HOUSEHOLD, parseHousehold } from './profile/schema';

/** A validator that accepts only `{ n: number }`. */
const parseCount = (raw: unknown) =>
  typeof raw === 'object' && raw !== null && typeof (raw as { n?: unknown }).n === 'number'
    ? (raw as { n: number })
    : null;

const blocked = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readStored', () => {
  it('returns null for a missing key without running the validator', () => {
    const parse = vi.fn(parseCount);
    expect(readStored('exhale.test', parse)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('returns the value that passes validation', () => {
    localStorage.setItem('exhale.test', '{"n":3}');
    expect(readStored('exhale.test', parseCount)).toEqual({ n: 3 });
  });

  it('returns null when the validator rejects a stale or tampered value', () => {
    localStorage.setItem('exhale.test', '{"n":"3"}');
    expect(readStored('exhale.test', parseCount)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('exhale.test', '{"n":3');
    const parse = vi.fn(parseCount);
    expect(readStored('exhale.test', parse)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
  });

  it('returns null when the validator throws', () => {
    localStorage.setItem('exhale.test', '{"n":3}');
    expect(
      readStored('exhale.test', () => {
        throw new Error('bad shape');
      }),
    ).toBeNull();
  });

  it('returns null when storage is blocked or missing', () => {
    localStorage.setItem('exhale.test', '{"n":3}');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    expect(readStored('exhale.test', parseCount)).toBeNull();
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', undefined);
    expect(readStored('exhale.test', parseCount)).toBeNull();
  });

  it('round-trips a household through the real schema validator', () => {
    writeStored(KEYS.household, DEFAULT_HOUSEHOLD);
    expect(readStored(KEYS.household, parseHousehold)).toEqual(DEFAULT_HOUSEHOLD);
    // A member name with markup fails the schema, so the whole value is ignored.
    const tampered = {
      ...DEFAULT_HOUSEHOLD,
      members: [{ ...DEFAULT_HOUSEHOLD.members[0], name: '<img onerror=x>' }],
    };
    writeStored(KEYS.household, tampered);
    expect(readStored(KEYS.household, parseHousehold)).toBeNull();
  });
});

describe('writeStored', () => {
  it('stores the value as JSON', () => {
    writeStored(KEYS.place, { lat: 28.61, lon: 77.21, label: 'New Delhi' });
    expect(localStorage.getItem(KEYS.place)).toBe('{"lat":28.61,"lon":77.21,"label":"New Delhi"}');
  });

  it('does nothing, without throwing, when storage is full', () => {
    localStorage.setItem(KEYS.theme, '"dark"');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => writeStored(KEYS.theme, 'light')).not.toThrow();
    vi.restoreAllMocks();
    expect(localStorage.getItem(KEYS.theme)).toBe('"dark"');
  });

  it('ignores values that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => writeStored(KEYS.chat, cyclic)).not.toThrow();
    expect(() => writeStored(KEYS.chat, 10n)).not.toThrow();
    expect(localStorage.getItem(KEYS.chat)).toBeNull();
  });
});

describe('removeStored', () => {
  it('removes only the given key', () => {
    writeStored(KEYS.done, ['ventilate']);
    writeStored(KEYS.theme, 'dark');
    removeStored(KEYS.done);
    expect(localStorage.getItem(KEYS.done)).toBeNull();
    expect(localStorage.getItem(KEYS.theme)).toBe('"dark"');
  });

  it('ignores storage errors', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(() => removeStored(KEYS.done)).not.toThrow();
  });
});

describe('KEYS', () => {
  it('namespaces every key under "exhale." and never reuses one', () => {
    const keys = Object.values(KEYS);
    expect(keys.every((k) => k.startsWith('exhale.'))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
