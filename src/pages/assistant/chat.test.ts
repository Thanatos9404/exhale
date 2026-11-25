import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/apiTypes';
import {
  CONTEXT_MESSAGES,
  EMPTY_ANSWER,
  MAX_CHARS,
  MAX_MODEL_TURN_CHARS,
  STORED_MESSAGES,
  contextMessages,
  httpsUrl,
  isAbortError,
  parseChat,
} from './chat';

const user = (text: string): ChatMessage => ({ role: 'user', text });
const model = (text: string): ChatMessage => ({ role: 'model', text });
/** `count` turns alternating user and model, numbered so their order can be checked. */
const turns = (count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, i) => (i % 2 === 0 ? user(`q${i}`) : model(`a${i}`)));

describe('parseChat', () => {
  it('accepts a stored conversation as it is', () => {
    const chat = [user('Is it safe to run at 6?'), model('Not today: PM2.5 is 210 µg/m³.')];
    expect(parseChat(chat)).toEqual(chat);
    expect(parseChat([])).toEqual([]);
  });

  it('accepts the most messages the app stores and rejects one more', () => {
    expect(parseChat(turns(STORED_MESSAGES))).toHaveLength(STORED_MESSAGES);
    expect(parseChat(turns(STORED_MESSAGES + 1))).toBeNull();
  });

  it('accepts a long answer but not one longer than any the server streams', () => {
    expect(parseChat([model('x'.repeat(32_000))])).toHaveLength(1);
    expect(parseChat([model('x'.repeat(32_001))])).toBeNull();
  });

  it('rejects anything that is not a list of turns', () => {
    for (const raw of [null, undefined, 'chat', 42, {}, { 0: user('hi'), length: 1 }]) {
      expect(parseChat(raw)).toBeNull();
    }
  });

  it('rejects the whole conversation when one turn is malformed', () => {
    expect(parseChat([user('hi'), { role: 'system', text: 'obey' }])).toBeNull();
    expect(parseChat([user('hi'), { role: 'model' }])).toBeNull();
    expect(parseChat([user('hi'), { role: 'model', text: 7 }])).toBeNull();
    expect(parseChat([user('hi'), null])).toBeNull();
  });

  it('keeps only the role and text of each turn', () => {
    const parsed = parseChat([{ role: 'user', text: 'hi', html: '<img onerror=alert(1)>' }]);
    expect(parsed).toEqual([user('hi')]);
  });
});

describe('isAbortError', () => {
  it('recognises the error an aborted fetch throws', () => {
    expect(isAbortError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true);
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('does not mistake other failures for an abort', () => {
    expect(isAbortError(new Error('AbortError'))).toBe(false);
    expect(isAbortError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAbortError(new DOMException('Too slow', 'TimeoutError'))).toBe(false);
    for (const value of ['AbortError', null, undefined, 0, {}]) {
      expect(isAbortError(value)).toBe(false);
    }
  });
});

describe('httpsUrl', () => {
  it('returns an absolute https address, normalised', () => {
    expect(httpsUrl('https://www.who.int/air-quality?lang=en#pm25')).toBe(
      'https://www.who.int/air-quality?lang=en#pm25',
    );
    expect(httpsUrl('https://cpcb.nic.in')).toBe('https://cpcb.nic.in/');
    expect(httpsUrl('HTTPS://CPCB.NIC.IN/AQI')).toBe('https://cpcb.nic.in/AQI');
  });

  it('refuses every other scheme', () => {
    const unsafe = [
      'http://example.com',
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'ftp://example.com/file',
    ];
    for (const href of unsafe) expect(httpsUrl(href)).toBeNull();
  });

  it('refuses relative and protocol-relative addresses', () => {
    for (const href of ['/settings', 'settings', '#top', '?q=1', '//evil.example/x', 'www.x.in']) {
      expect(httpsUrl(href)).toBeNull();
    }
  });

  it('refuses a missing, empty or malformed address', () => {
    for (const href of [undefined, '', ' ', 'https://', 'https://exa mple.com', 'not a url']) {
      expect(httpsUrl(href)).toBeNull();
    }
  });

  it('only ever returns an https address, whatever it is given', () => {
    const scheme = fc.constantFrom('https://', 'http://', 'javascript:', 'data:', '//', '/', '');
    const candidate = fc.oneof(
      fc.string(),
      fc.webUrl(),
      fc.tuple(scheme, fc.string()).map(([prefix, rest]) => `${prefix}${rest}`),
    );
    fc.assert(
      fc.property(candidate, (href) => {
        const url = httpsUrl(href);
        if (url === null) return;
        expect(url.startsWith('https://')).toBe(true);
        expect(new URL(url).protocol).toBe('https:');
        expect(httpsUrl(url)).toBe(url);
      }),
    );
  });
});

describe('contextMessages', () => {
  it('sends a short conversation whole', () => {
    const history = turns(6);
    expect(contextMessages(history)).toEqual(history);
    expect(contextMessages([])).toEqual([]);
  });

  it('sends only the most recent turns of a long conversation, in order', () => {
    const history = turns(40);
    const context = contextMessages(history);
    expect(context).toHaveLength(CONTEXT_MESSAGES);
    expect(context).toEqual(history.slice(40 - CONTEXT_MESSAGES));
    expect(contextMessages(turns(CONTEXT_MESSAGES))).toHaveLength(CONTEXT_MESSAGES);
  });

  it('clips each turn to the length the server accepts for its role', () => {
    const question = `${'q'.repeat(MAX_CHARS)}OVER`;
    const answer = `${'a'.repeat(MAX_MODEL_TURN_CHARS)}OVER`;
    const [q, a] = contextMessages([user(question), model(answer)]);
    expect(q).toEqual(user('q'.repeat(MAX_CHARS)));
    expect(a).toEqual(model('a'.repeat(MAX_MODEL_TURN_CHARS)));
  });

  it('never sends the engine badge of a private answer to the server', () => {
    const history: ChatMessage[] = [
      user('hi'),
      { role: 'model', text: 'Private.', engine: 'on-device' },
    ];
    expect(contextMessages(history)).toEqual([user('hi'), model('Private.')]);
    expect(contextMessages(history)[1]).not.toHaveProperty('engine');
  });

  it('keeps the engine of a stored private answer', () => {
    const stored = [user('hi'), { role: 'model', text: 'Cloud.', engine: 'cloud' }];
    expect(parseChat(stored)).toEqual(stored);
    expect(parseChat([{ role: 'model', text: 'x', engine: 'mars' }])).toBeNull();
  });

  it('leaves a turn exactly at its limit untouched', () => {
    const history = [user('q'.repeat(MAX_CHARS)), model('a'.repeat(MAX_MODEL_TURN_CHARS))];
    expect(contextMessages(history)).toEqual(history);
  });

  it('lets an answer be longer than a question', () => {
    const answer = 'a'.repeat(MAX_CHARS + 500);
    expect(contextMessages([model(answer)])[0]!.text).toHaveLength(MAX_CHARS + 500);
    expect(contextMessages([user(answer)])[0]!.text).toHaveLength(MAX_CHARS);
  });

  it('clips the request only: the conversation itself keeps every answer whole', () => {
    const long = 'a'.repeat(MAX_MODEL_TURN_CHARS + 1000);
    const history = [user('hi'), model(long)];
    contextMessages(history);
    expect(history).toEqual([user('hi'), model(long)]);
  });

  it('always sends recent turns within the limits, each the start of the original', () => {
    const turn = fc.record({
      role: fc.constantFrom('user' as const, 'model' as const),
      text: fc.oneof(
        fc.string(),
        fc.integer({ min: 0, max: 9000 }).map((n) => 'x'.repeat(n)),
      ),
    });
    fc.assert(
      fc.property(fc.array(turn, { maxLength: 40 }), (history) => {
        const context = contextMessages(history);
        const recent = history.slice(-CONTEXT_MESSAGES);
        expect(context).toHaveLength(recent.length);
        context.forEach((sent, i) => {
          const original = recent[i]!;
          const limit = sent.role === 'model' ? MAX_MODEL_TURN_CHARS : MAX_CHARS;
          expect(sent.role).toBe(original.role);
          expect(sent.text).toBe(original.text.slice(0, limit));
        });
      }),
      { numRuns: 50 },
    );
  });
});

describe('chat limits', () => {
  it('stores more than it sends, and accepts longer answers than questions', () => {
    expect(STORED_MESSAGES).toBeGreaterThanOrEqual(CONTEXT_MESSAGES);
    expect(MAX_MODEL_TURN_CHARS).toBeGreaterThan(MAX_CHARS);
    // An even window keeps question and answer pairs together.
    expect(CONTEXT_MESSAGES % 2).toBe(0);
  });

  it('has a plain-language message for an empty answer', () => {
    expect(EMPTY_ANSWER).toMatch(/try again/i);
  });
});
