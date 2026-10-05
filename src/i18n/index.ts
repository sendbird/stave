/**
 * Renderer i18n entry point.
 *
 * Importing this module initializes the shared i18next instance synchronously
 * with every bundled catalog, so components, store actions and tests can call
 * `t` without waiting. Always import `useTranslation` / `Trans` from here
 * rather than from `react-i18next` so the instance is initialized first.
 *
 * Rules (see docs/developer/i18n.md):
 * - Never call `t` at module scope; store keys in constant tables instead.
 * - Components that render translated text call `useTranslation()` so a
 *   language change re-renders them.
 */
import { initReactI18next } from "react-i18next";
import { i18n, getAppLocale } from "@/i18n/runtime";
import { APP_LOCALE_INTL_TAGS, normalizeAppLocale, type AppLocale } from "@/i18n/locale";

export { Trans, useTranslation } from "react-i18next";
export * from "@/i18n/runtime";

// The shared runtime is already initialized; attach React to that same instance.
initReactI18next.init(i18n);

type LocaleListener = (locale: AppLocale) => void;
const localeListeners = new Set<LocaleListener>();

/**
 * Observe display-language changes outside React (for example to re-push the
 * locale to the Electron main process). Returns an unsubscribe function.
 */
export function subscribeAppLocale(listener: LocaleListener): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

/**
 * Switch the display language. Safe to call repeatedly with the same value.
 * Updates `<html lang>` so assistive technology and font fallback (Korean
 * glyph selection) follow the UI language.
 */
export function applyAppLocale(value: unknown): AppLocale {
  const locale = normalizeAppLocale(value);
  if (typeof document !== "undefined") {
    document.documentElement.lang = APP_LOCALE_INTL_TAGS[locale];
  }
  if (getAppLocale() !== locale || i18n.language !== locale) {
    void i18n.changeLanguage(locale);
    for (const listener of localeListeners) listener(locale);
  }
  // Always tell the main process: it persists its own copy for native menus
  // and dialogs, and may have started with a stale value.
  const setMainLocale = typeof window === "undefined" ? undefined : window.api?.window?.setLocale;
  if (setMainLocale) {
    void setMainLocale({ locale }).catch((error: unknown) => {
      console.warn("[i18n] failed to sync locale to the main process", error);
    });
  }
  return locale;
}
