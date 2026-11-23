/** How Gemini failures are classified, which decides whether to try another key × model pair. */

/** Errors worth retrying elsewhere: unknown model, quota, overload, timeouts. */
export function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /404|not found|thinking|no longer available|429|quota|rate|503|overload|high demand|unavailable|500|internal|deadline|timeout|abort/i.test(
    msg,
  );
}

/** True when the error says a key's quota is spent, which lasts longer than an overload spike. */
export function isQuotaError(err: unknown): boolean {
  return /429|quota|exhausted/i.test(err instanceof Error ? err.message : String(err));
}
