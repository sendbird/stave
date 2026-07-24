/**
 * Locale normalization for spawned PTY sessions.
 *
 * When the Stave desktop app is launched from Finder/Dock on macOS (rather than
 * from a terminal), it inherits no `LANG`/`LC_*` variables, so `process.env`
 * carries the `C`/`POSIX` locale. A shell spawned into a PTY under that locale
 * treats multibyte UTF-8 input (Korean, Japanese, emoji, ...) one byte at a
 * time, so its line editor fragments each character on echo — e.g. typing
 * `안녕하세요` renders as `�<0095><0088>...`. Ensuring the PTY inherits a UTF-8
 * codeset makes the shell treat that input as whole characters.
 */

// Matches a trailing UTF-8 codeset such as `.UTF-8` or `.utf8`.
const UTF8_CODESET_PATTERN = /\.utf-?8$/i;

// Ships on both macOS (always) and typical Linux locale sets, so it reliably
// carries a UTF-8 codeset without risking a "locale not installed" fallback to
// C. The language/region portion is irrelevant to multibyte handling — only
// the `.UTF-8` codeset matters for character classification.
const FALLBACK_UTF8_LOCALE = "en_US.UTF-8";

/** True when the locale string declares a UTF-8 codeset (case-insensitive). */
export function hasUtf8Codeset(value: string | undefined | null): boolean {
  return typeof value === "string" && UTF8_CODESET_PATTERN.test(value.trim());
}

/**
 * Returns a shallow copy of `env` guaranteed to declare a UTF-8 codeset for
 * character classification, without touching an env that already has one.
 *
 * Locale precedence for `LC_CTYPE` is `LC_ALL` > `LC_CTYPE` > `LANG`, so the
 * fix is applied to whichever variable actually governs the effective codeset.
 */
export function ensureUtf8Locale(
  env: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = { ...env };

  const effectiveCtype = next.LC_ALL || next.LC_CTYPE || next.LANG;
  if (hasUtf8Codeset(effectiveCtype)) {
    return next;
  }

  // `LC_ALL` overrides every category, so it must carry the UTF-8 codeset when
  // it is what forces the non-UTF-8 locale.
  if (next.LC_ALL && !hasUtf8Codeset(next.LC_ALL)) {
    next.LC_ALL = FALLBACK_UTF8_LOCALE;
    return next;
  }

  next.LANG = FALLBACK_UTF8_LOCALE;
  // `LC_CTYPE` overrides `LANG` for character classification, so align it too
  // when it is present but non-UTF-8.
  if (next.LC_CTYPE && !hasUtf8Codeset(next.LC_CTYPE)) {
    next.LC_CTYPE = FALLBACK_UTF8_LOCALE;
  }
  return next;
}
