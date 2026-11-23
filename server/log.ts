/**
 * Server logging with one prefix, so function logs are easy to filter.
 *
 * Callers pass a short message and at most one pre-formatted detail. Raw error, request or SDK
 * config objects are never logged: they can carry API keys, headers or user data. Anything shaped
 * like an API key is masked as well, as a last line of defence.
 */

const PREFIX = '[exhale]';

/** A pre-formatted value to log after the message. Objects are not accepted on purpose. */
export type LogDetail = string | number;

const SECRETS: readonly (readonly [RegExp, string])[] = [
  // Google AI Studio keys.
  [/AIza[\w-]{35}/g, '[redacted]'],
  // Anthropic keys.
  [/sk-ant-[\w-]+/g, '[redacted]'],
  // Keys passed as a URL query parameter.
  [/([?&]key=)[^&\s]+/g, '$1[redacted]'],
];

/** Masks anything that looks like an API key so it cannot reach the logs. */
export function redact(text: string): string {
  return SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/**
 * A short description of a thrown value: the message only, never the stack, cause or request
 * config. `max` truncates long provider messages; omit it to keep the whole message.
 */
export function errorMessage(err: unknown, max?: number): string {
  return err instanceof Error ? err.message.slice(0, max) : 'unknown';
}

function format(message: string, detail?: LogDetail): LogDetail[] {
  const line = `${PREFIX} ${redact(message)}`;
  if (detail === undefined) return [line];
  return [line, typeof detail === 'string' ? redact(detail) : detail];
}

/** Logs a recoverable problem, such as a provider failing over to the next one. */
export function warn(message: string, detail?: LogDetail): void {
  console.warn(...format(message, detail));
}

/** Logs a failure the request could not recover from. */
export function error(message: string, detail?: LogDetail): void {
  console.error(...format(message, detail));
}
