/**
 * `decodeURIComponent` throws `URIError` on a stray `%` (`/task/100%`,
 * `?q=%E0%A4%A`). Link parsers run during render, so one malformed URL in chat
 * text used to take down the whole renderer.
 *
 * On failure, decode one UTF-8 sequence of `%XX` escapes at a time and keep
 * only the escapes that do not form a valid sequence as raw text. Falling back
 * to the whole raw string instead would let a key regex stop at an escape,
 * e.g. read `DFE-12%33%2F%FF` as `DFE-12` rather than `DFE-123`.
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value.replace(/(?:%[0-9A-Fa-f]{2})+/g, decodeEscapeRun);
  }
}

function utf8SequenceLength(leadByte: number) {
  if (leadByte >= 0xf0) return 4;
  if (leadByte >= 0xe0) return 3;
  if (leadByte >= 0xc0) return 2;
  return 1;
}

function decodeEscapeRun(run: string): string {
  const escapes = run.match(/%[0-9A-Fa-f]{2}/g) ?? [];
  let decoded = "";
  let index = 0;
  while (index < escapes.length) {
    const escape = escapes[index]!;
    const length = utf8SequenceLength(Number.parseInt(escape.slice(1), 16));
    try {
      decoded += decodeURIComponent(
        escapes.slice(index, index + length).join(""),
      );
      index += length;
    } catch {
      decoded += escape;
      index += 1;
    }
  }
  return decoded;
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
