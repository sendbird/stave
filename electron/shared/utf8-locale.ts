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
 *
 * The fallback locale is resolved against the codesets actually installed on
 * the host (via `locale -a`): forcing `LANG` to a locale that was never
 * generated makes glibc fall back to `C`, leaving multibyte input just as
 * garbled. Detection covers Linux hosts (deb/AppImage targets) where
 * `en_US.UTF-8` is not guaranteed to exist.
 */

import { execFileSync } from "node:child_process";

// Matches a trailing UTF-8 codeset such as `.UTF-8` or `.utf8`.
const UTF8_CODESET_PATTERN = /\.utf-?8$/i;

// Language-neutral UTF-8 locales, in preference order, used when the broken
// locale carries no reusable language. `C.UTF-8` needs no locale generation on
// the glibc/musl builds Stave ships to (Debian/Ubuntu deb, modern-glibc
// AppImage); `en_US.UTF-8` is the macOS fallback, since macOS ships no
// `C.UTF-8`.
const NEUTRAL_UTF8_LOCALES = ["C.UTF-8", "C.utf8", "en_US.UTF-8"] as const;

// Used only when detection finds nothing installed — e.g. Windows (whose PTY
// codeset is not env-driven) or a `locale -a` failure. Harmless where unused.
const LAST_RESORT_UTF8_LOCALE = "en_US.UTF-8";

/** True when the locale string declares a UTF-8 codeset (case-insensitive). */
export function hasUtf8Codeset(value: string | undefined | null): boolean {
  return typeof value === "string" && UTF8_CODESET_PATTERN.test(value.trim());
}

// Strips codeset/modifier from a locale, returning a reusable language/region
// (e.g. `en_US` from `en_US.ISO8859-1`). Returns null for the language-less
// `C`/`POSIX`/empty cases, where no language can be preserved.
function languageOf(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const base = value.trim().split(".")[0].split("@")[0];
  if (!base || base === "C" || base === "POSIX") return null;
  return base;
}

/**
 * Chooses an installed UTF-8 locale to replace a non-UTF-8 `value`, preferring
 * (1) a UTF-8 variant of the same language/region, then (2) a portable
 * language-neutral locale, then (3) any installed UTF-8 locale, and finally
 * (4) a last-resort constant when nothing is installed.
 */
export function pickUtf8Locale(
  value: string | undefined | null,
  availableUtf8Locales: readonly string[],
): string {
  const available = availableUtf8Locales.filter(hasUtf8Codeset);

  // (1) Preserve the language/region when a UTF-8 variant of it is installed.
  const language = languageOf(value);
  if (language) {
    const prefix = `${language.toLowerCase()}.`;
    const match = available.find((l) => l.toLowerCase().startsWith(prefix));
    if (match) return match;
  }

  // (2) Portable, language-neutral choice.
  for (const preferred of NEUTRAL_UTF8_LOCALES) {
    const match = available.find(
      (l) => l.toLowerCase() === preferred.toLowerCase(),
    );
    if (match) return match;
  }

  // (3) Any installed UTF-8 locale still fixes character classification.
  if (available.length > 0) return available[0];

  // (4) Nothing detected.
  return LAST_RESORT_UTF8_LOCALE;
}

let cachedAvailableUtf8Locales: readonly string[] | null = null;

/**
 * Returns the UTF-8 locales installed on this host (from `locale -a`), cached
 * after the first lookup. Returns an empty list on platforms without `locale`
 * (Windows) or when the lookup fails.
 */
export function getAvailableUtf8Locales(): readonly string[] {
  if (cachedAvailableUtf8Locales) return cachedAvailableUtf8Locales;
  cachedAvailableUtf8Locales = detectUtf8Locales();
  return cachedAvailableUtf8Locales;
}

function detectUtf8Locales(): readonly string[] {
  if (process.platform === "win32") return [];
  try {
    const output = execFileSync("locale", ["-a"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(hasUtf8Codeset);
  } catch {
    return [];
  }
}

/**
 * Returns a shallow copy of `env` guaranteed to declare a UTF-8 codeset for
 * character classification, without touching an env that already has one.
 *
 * Locale precedence for `LC_CTYPE` is `LC_ALL` > `LC_CTYPE` > `LANG`, so the
 * fix is applied to whichever variable actually governs the effective codeset.
 * The replacement is chosen from the locales installed on the host so it is
 * one that actually resolves to UTF-8.
 */
export function ensureUtf8Locale(
  env: Record<string, string>,
  availableUtf8Locales: readonly string[] = getAvailableUtf8Locales(),
): Record<string, string> {
  const next: Record<string, string> = { ...env };

  const effectiveCtype = next.LC_ALL || next.LC_CTYPE || next.LANG;
  if (hasUtf8Codeset(effectiveCtype)) {
    return next;
  }

  // `LC_ALL` overrides every category, so it must carry the UTF-8 codeset when
  // it is what forces the non-UTF-8 locale.
  if (next.LC_ALL && !hasUtf8Codeset(next.LC_ALL)) {
    next.LC_ALL = pickUtf8Locale(next.LC_ALL, availableUtf8Locales);
    return next;
  }

  const fallback = pickUtf8Locale(
    next.LC_CTYPE || next.LANG,
    availableUtf8Locales,
  );
  next.LANG = fallback;
  // `LC_CTYPE` overrides `LANG` for character classification, so align it too
  // when it is present but non-UTF-8.
  if (next.LC_CTYPE && !hasUtf8Codeset(next.LC_CTYPE)) {
    next.LC_CTYPE = fallback;
  }
  return next;
}
