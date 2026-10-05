/**
 * Main-process i18n.
 *
 * The renderer owns the display-language setting and pushes it here through
 * `window:set-locale`. The last value is kept in `<userData>/app-locale.json`
 * so native surfaces that appear before the renderer loads (application menu,
 * crash-recovery dialog) already use the chosen language on the next launch.
 *
 * Only the `desktop` and `common` namespaces are bundled into the main process.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import {
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  type AppLocale,
} from "../../src/i18n/locale";
import enCommon from "../../src/locales/en/common.json";
import enDesktop from "../../src/locales/en/desktop.json";
import koCommon from "../../src/locales/ko/common.json";
import koDesktop from "../../src/locales/ko/desktop.json";

const mainI18n = i18next.createInstance();
void mainI18n.init({
  resources: {
    en: { common: enCommon, desktop: enDesktop },
    ko: { common: koCommon, desktop: koDesktop },
  },
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  ns: ["desktop", "common"],
  defaultNS: "desktop",
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

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
