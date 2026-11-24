/**
 * Same-origin guard for state-changing requests. The API has no CORS and no cookies, but every
 * POST spends paid AI quota, so another website must not be able to make a visitor's browser
 * send one.
 */
import { HttpError } from './http.js';

/**
 * Sec-Fetch-Site values a legitimate caller sends: "same-origin" from the app's own fetch, and
 * "none" for a request the user started directly. "same-site" is refused too, because a sibling
 * subdomain is a different origin.
 */
const ALLOWED_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin', 'none']);

const CROSS_SITE = 'Cross-site requests are not allowed';

/** The host of an Origin header value, or null when it is not a URL (for example "null"). */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The host this request was sent to: the Host header, or x-forwarded-host behind a proxy, falling
 * back to the request URL. A page cannot set either header on a cross-origin request.
 */
function requestHost(request: Request): string {
  const named = [request.headers.get('host'), request.headers.get('x-forwarded-host')]
    .map((value) => value?.split(',')[0]?.trim())
    .find(Boolean);
  return (named ?? new URL(request.url).host).toLowerCase();
}

/**
 * Throws 403 unless the request comes from this origin. Browsers attach Origin to every
 * cross-origin POST and Sec-Fetch-Site to every request, so either header naming another site is
 * refused. A request with neither (curl, server-to-server, tests) is not a browser and is allowed.
 */
export function assertSameOrigin(request: Request): void {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && !ALLOWED_FETCH_SITES.has(site.trim().toLowerCase()))
    throw new HttpError(403, CROSS_SITE);
  const origin = request.headers.get('origin');
  if (origin !== null && hostOf(origin) !== requestHost(request))
    throw new HttpError(403, CROSS_SITE);
}
