/**
 * Client identity for rate limiting: one stable key per visitor, taken from the headers the
 * platform sets and reduced so that one visitor cannot appear as many.
 */

/**
 * Where the client address is read from, most trustworthy first. Vercel overwrites
 * x-vercel-forwarded-for and x-real-ip at its edge, so a client cannot forge them; x-forwarded-for
 * can carry hops a client added, so it is only the last resort.
 */
const ADDRESS_HEADERS = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'] as const;

/** Longest key kept; a full IPv6 address is 39 characters, so anything longer is junk. */
const MAX_KEY_CHARS = 64;

/** An IPv6 address has eight 16-bit groups. */
const IPV6_GROUPS = 8;

/** The first four groups are the /64 network prefix that one subscriber line is handed. */
const PREFIX_GROUPS = 4;

/** The first hop of a forwarded list, without brackets, port or zone id. */
function firstHop(value: string | null): string {
  const hop = (value ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  const bracketed = /^\[([^\]]+)\]/.exec(hop);
  return (bracketed?.[1] ?? hop).split('%')[0] ?? '';
}

/** All eight groups of an IPv6 address with "::" expanded, or null when it is not one. */
function ipv6Groups(ip: string): string[] | null {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? IPV6_GROUPS - head.length - tail.length : 0;
  if (missing < 0) return null;
  const groups = [...head, ...Array.from({ length: missing }, () => '0'), ...tail];
  const valid = groups.length === IPV6_GROUPS && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g));
  return valid ? groups : null;
}

/**
 * An IPv6 address reduced to its /64 prefix. A home or mobile line is handed a whole /64, so
 * keying on the full address would give one device 2^64 fresh quotas. IPv4 passes through, and an
 * IPv4-mapped address ("::ffff:1.2.3.4") becomes the IPv4 address it stands for.
 */
export function collapseAddress(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const groups = ip.includes(':') ? ipv6Groups(ip) : null;
  if (!groups) return ip;
  const prefix = groups.slice(0, PREFIX_GROUPS).map((g) => parseInt(g, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

/** Best-effort client key for rate limiting; "local" when no platform header is present. */
export function clientKey(request: Request): string {
  const hops = ADDRESS_HEADERS.map((name) => firstHop(request.headers.get(name)));
  // First non-empty value wins: an empty header falls through to the next one.
  const ip = hops.find(Boolean) ?? 'local';
  return collapseAddress(ip).slice(0, MAX_KEY_CHARS);
}
