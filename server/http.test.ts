// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clientKey, methodNotAllowed, readJson } from './http';
import { collapseAddress } from './clientKey';
import { assertSameOrigin } from './origin';

const post = (
  body: BodyInit,
  headers: Record<string, string>,
  url = 'https://exhale.example/api/x',
) => new Request(url, { method: 'POST', headers, body, duplex: 'half' } as RequestInit);

describe('readJson: content type', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON ;charset=UTF-8',
  ])('accepts %s', async (type) => {
    await expect(readJson(post('{"a":1}', { 'content-type': type }), 100)).resolves.toEqual({
      a: 1,
    });
  });

  it.each([
    // CORS-safelisted types that merely mention JSON: any website could post these.
    'text/plain; charset=application/json',
    'text/plain;application/json',
    'multipart/form-data; boundary=application/json',
    'application/x-www-form-urlencoded; x=application/json',
    'application/jsonp',
    'application/json-seq',
    'text/json',
    '',
  ])('rejects "%s" with 415', async (type) => {
    await expect(readJson(post('{"a":1}', { 'content-type': type }), 100)).rejects.toMatchObject({
      status: 415,
    });
  });

  it('rejects a request with no content type at all', async () => {
    const bare = new Request('https://exhale.example/api/x', { method: 'POST' });
    await expect(readJson(bare, 100)).rejects.toMatchObject({ status: 415 });
  });
});

describe('readJson: body size', () => {
  const json = { 'content-type': 'application/json' };

  /** A body that never ends: every pull hands over another 400 bytes. */
  function endless() {
    const seen = { pulled: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          seen.pulled++;
          controller.enqueue(new Uint8Array(400).fill(120));
        },
        cancel() {
          seen.cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    return { body, seen };
  }

  it('stops reading at the cap instead of buffering a body with no content-length', async () => {
    const { body, seen } = endless();
    await expect(readJson(post(body, json), 1_000)).rejects.toMatchObject({ status: 413 });
    // 1,000 bytes are passed on the third 400-byte chunk; the rest is never pulled.
    expect(seen.pulled).toBeLessThanOrEqual(4);
    expect(seen.cancelled).toBe(true);
  });

  it('counts the bytes itself when content-length understates the body', async () => {
    const lying = { ...json, 'content-length': '10' };
    const body = JSON.stringify({ padding: 'x'.repeat(5_000) });
    await expect(readJson(post(body, lying), 1_000)).rejects.toMatchObject({ status: 413 });
  });

  it('counts bytes, not characters', async () => {
    // 40 Devanagari characters are 120 bytes of UTF-8.
    const body = JSON.stringify({ t: 'द'.repeat(40) });
    await expect(readJson(post(body, json), 100)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(post(body, json), 200)).resolves.toEqual({ t: 'द'.repeat(40) });
  });

  it('rejects on the declared length before reading anything', async () => {
    const { body, seen } = endless();
    const declared = { ...json, 'content-length': '999999' };
    await expect(readJson(post(body, declared), 1_000)).rejects.toMatchObject({ status: 413 });
    expect(seen.pulled).toBe(0);
  });

  it('reassembles a multi-byte character split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"दिल्ली"}');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    await expect(readJson(post(body, json), 1_000)).resolves.toEqual({ t: 'दिल्ली' });
  });

  it('answers 400 for an empty body', async () => {
    const empty = new Request('https://exhale.example/api/x', { method: 'POST', headers: json });
    await expect(readJson(empty, 100)).rejects.toMatchObject({ status: 400 });
  });
});

describe('assertSameOrigin', () => {
  const from = (headers: Record<string, string>, url = 'https://exhale.example/api/plan') =>
    new Request(url, { method: 'POST', headers });
  const refused = (request: Request) => {
    try {
      assertSameOrigin(request);
      return 0;
    } catch (err) {
      return (err as { status: number }).status;
    }
  };

  it('allows a request with neither Origin nor Sec-Fetch-Site (curl, server-to-server, tests)', () => {
    expect(refused(from({}))).toBe(0);
  });

  it('allows the app itself: Origin matches the Host header', () => {
    expect(refused(from({ host: 'exhale.example', origin: 'https://exhale.example' }))).toBe(0);
    expect(
      refused(
        from({
          host: 'exhale.example',
          origin: 'https://exhale.example',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toBe(0);
  });

  it('rejects another website with 403', () => {
    expect(refused(from({ host: 'exhale.example', origin: 'https://evil.example' }))).toBe(403);
  });

  it('rejects a look-alike host, a sibling subdomain and a different port', () => {
    const host = 'exhale.example';
    for (const origin of [
      'https://exhale.example.evil.test',
      'https://app.exhale.example',
      'https://exhale.example:8443',
    ]) {
      expect(refused(from({ host, origin }))).toBe(403);
    }
  });

  it('rejects an opaque origin ("null") from a sandboxed frame or a redirect', () => {
    expect(refused(from({ host: 'exhale.example', origin: 'null' }))).toBe(403);
  });

  it('compares hosts without regard to case or a default port', () => {
    expect(refused(from({ host: 'Exhale.Example', origin: 'https://exhale.example:443' }))).toBe(0);
    expect(refused(from({ host: 'localhost:5173', origin: 'http://localhost:5173' }))).toBe(0);
  });

  it('uses x-forwarded-host when there is no Host header, then the request URL', () => {
    const origin = 'https://exhale.example';
    expect(
      refused(from({ 'x-forwarded-host': 'exhale.example', origin }, 'http://10.0.0.5/api')),
    ).toBe(0);
    expect(
      refused(from({ 'x-forwarded-host': 'other.example', origin }, 'http://10.0.0.5/api')),
    ).toBe(403);
    expect(refused(from({ origin }))).toBe(0);
    expect(refused(from({ origin: 'https://evil.example' }))).toBe(403);
  });

  it('rejects Sec-Fetch-Site values other than same-origin and none', () => {
    expect(refused(from({ 'sec-fetch-site': 'cross-site' }))).toBe(403);
    expect(refused(from({ 'sec-fetch-site': 'same-site' }))).toBe(403);
    expect(refused(from({ 'sec-fetch-site': 'none' }))).toBe(0);
    expect(refused(from({ 'sec-fetch-site': 'Same-Origin' }))).toBe(0);
  });

  it('rejects when either header names another site, even if the other looks fine', () => {
    const host = 'exhale.example';
    expect(
      refused(from({ host, origin: 'https://exhale.example', 'sec-fetch-site': 'cross-site' })),
    ).toBe(403);
    expect(
      refused(from({ host, origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' })),
    ).toBe(403);
  });
});

describe('clientKey', () => {
  const key = (headers: Record<string, string>) => clientKey(new Request('http://x', { headers }));

  it('prefers x-vercel-forwarded-for, then x-real-ip, then the first x-forwarded-for hop', () => {
    const all = {
      'x-vercel-forwarded-for': '203.0.113.1',
      'x-real-ip': '203.0.113.2',
      'x-forwarded-for': '203.0.113.3, 10.0.0.1',
    };
    expect(key(all)).toBe('203.0.113.1');
    expect(key({ 'x-real-ip': all['x-real-ip'], 'x-forwarded-for': all['x-forwarded-for'] })).toBe(
      '203.0.113.2',
    );
    expect(key({ 'x-forwarded-for': all['x-forwarded-for'] })).toBe('203.0.113.3');
    expect(key({})).toBe('local');
  });

  it('ignores a forged x-forwarded-for when the platform header is present', () => {
    const forged = { 'x-forwarded-for': '1.1.1.1', 'x-vercel-forwarded-for': '203.0.113.9' };
    expect(key(forged)).toBe('203.0.113.9');
  });

  it('skips an empty header and takes the first hop of a list', () => {
    expect(key({ 'x-vercel-forwarded-for': ' ', 'x-real-ip': '5.6.7.8' })).toBe('5.6.7.8');
    expect(key({ 'x-vercel-forwarded-for': '9.9.9.9, 10.0.0.1' })).toBe('9.9.9.9');
  });

  it('gives every address in one IPv6 /64 the same key', () => {
    const a = key({ 'x-real-ip': '2001:db8:abcd:12:1111:2222:3333:4444' });
    const b = key({ 'x-real-ip': '2001:DB8:ABCD:0012:ffff:ffff:ffff:ffff' });
    expect(a).toBe('2001:db8:abcd:12::/64');
    expect(b).toBe(a);
    expect(key({ 'x-real-ip': '2001:db8:abcd:13::1' })).not.toBe(a);
  });

  it('expands "::" before taking the prefix', () => {
    expect(collapseAddress('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(collapseAddress('::1')).toBe('0:0:0:0::/64');
    expect(collapseAddress('fe80::')).toBe('fe80:0:0:0::/64');
  });

  it('reads bracketed addresses with a port or zone id', () => {
    expect(key({ 'x-real-ip': '[2001:db8:1:2::9]:4433' })).toBe('2001:db8:1:2::/64');
    expect(key({ 'x-real-ip': 'fe80::1%eth0' })).toBe('fe80:0:0:0::/64');
  });

  it('treats an IPv4-mapped address as the IPv4 address it is', () => {
    expect(collapseAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves IPv4 and anything that is not an address unchanged, capped at 64 characters', () => {
    expect(collapseAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(collapseAddress('1:2:3')).toBe('1:2:3');
    expect(collapseAddress('1::2::3')).toBe('1::2::3');
    expect(collapseAddress('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(collapseAddress('1:2:3:4:5:6:7::8:9')).toBe('1:2:3:4:5:6:7::8:9');
    expect(collapseAddress('g::1')).toBe('g::1');
    expect(key({ 'x-real-ip': 'x'.repeat(200) })).toHaveLength(64);
  });
});

describe('methodNotAllowed', () => {
  it('answers 405 with an Allow header and the security headers', async () => {
    const res = methodNotAllowed('GET')();
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'Use GET' });
  });
});
