/**
 * App display locale contract.
 *
 * Shared by the renderer, the settings store and the Electron main process, so
 * it must not import i18next or React.
 */
export const APP_LOCALES = ["en", "ko"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_APP_LOCALE: AppLocale = "en";

/** BCP 47 tags handed to `Intl` formatters and `<html lang>`. */
export const APP_LOCALE_INTL_TAGS: Record<AppLocale, string> = {
  en: "en-US",
  ko: "ko-KR",
};

/**
 * Each language is listed in its own script so a reader who cannot read the
 * current UI language can still find theirs.
 */
export const APP_LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  ko: "한국어",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as readonly string[]).includes(value);
}

export function normalizeAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_APP_LOCALE;
}
