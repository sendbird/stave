/**
 * `decodeURIComponent` throws `URIError` on a stray `%` (`/task/100%`,
 * `?q=%E0%A4%A`). Link parsers run during render, so one malformed URL in chat
 * text used to take down the whole renderer.
 *
 * On failure, decode each run of `%XX` escapes on its own and keep only the
 * runs that are not valid UTF-8 as raw text. Falling back to the whole raw
 * string instead would let a key regex stop at an escape, e.g. read
 * `DFE-12%33/100%` as `DFE-12` rather than `DFE-123`.
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    });
  }
}

const LONE_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * `encodeURIComponent` throws `URIError` on a lone UTF-16 surrogate, which a
 * truncated or corrupted chat string can contain. Replace lone surrogates with
 * U+FFFD (as `String.prototype.toWellFormed` does) before encoding.
 */
export function safeEncodeURIComponent(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    return encodeURIComponent(value.replace(LONE_SURROGATE_PATTERN, "\uFFFD"));
  }
}
