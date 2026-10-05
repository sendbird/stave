/**
 * Main-process i18n.
 *
 * The renderer owns the display-language setting and pushes it here through
 * `window:set-locale`. The last value is kept in `<userData>/app-locale.json`
 * so native surfaces that appear before the renderer loads (application menu,
 * crash-recovery dialog) already use the chosen language on the next launch.
 *
 * The React-free runtime also serves shared main-process presentation helpers.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { i18n as mainI18n, normalizeAppLocale, type AppLocale } from "../../src/i18n/runtime";

/** Translate a `desktop` (or `common:`-prefixed) key in the current main-process locale. */
export const tMain = mainI18n.getFixedT(null, "desktop");

type LocaleListener = (locale: AppLocale) => void;
const listeners = new Set<LocaleListener>();

function localeFilePath(): string {
  return path.join(app.getPath("userData"), "app-locale.json");
}

export function getMainLocale(): AppLocale {
  return normalizeAppLocale(mainI18n.language);
}

/** Read the persisted locale once at startup. Missing or invalid files keep the default. */
export function loadPersistedMainLocale(): AppLocale {
  try {
    const parsed = JSON.parse(fs.readFileSync(localeFilePath(), "utf8")) as {
      locale?: unknown;
    };
    void mainI18n.changeLanguage(normalizeAppLocale(parsed.locale));
  } catch {
    // First launch or unreadable file: stay on the default locale.
  }
  return getMainLocale();
}

/** Apply a locale pushed by the renderer, persist it, and notify listeners on change. */
export function setMainLocale(value: unknown): AppLocale {
  const locale = normalizeAppLocale(value);
  if (locale === getMainLocale()) return locale;
  void mainI18n.changeLanguage(locale);
  try {
    fs.mkdirSync(path.dirname(localeFilePath()), { recursive: true });
    fs.writeFileSync(localeFilePath(), `${JSON.stringify({ locale }, null, 2)}\n`);
  } catch (error) {
    console.warn("[i18n] failed to persist app locale", error);
  }
  for (const listener of listeners) listener(locale);
  return locale;
}

export function onMainLocaleChange(listener: LocaleListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
