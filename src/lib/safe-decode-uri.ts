/**
 * `decodeURIComponent` throws `URIError` on a stray `%` (`/task/100%`,
 * `?q=%E0%A4%A`). Link parsers run during render, so one malformed URL in chat
 * text used to take down the whole renderer. Return the input unchanged
 * instead, so matching continues against the raw text.
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
