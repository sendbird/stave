/** React-free translation instance for renderer and shared main/preload helpers. */
import i18next, { type ParseKeys, type TFunction } from "i18next";
import {
  APP_LOCALE_INTL_TAGS,
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  normalizeAppLocale,
  type AppLocale,
} from "@/i18n/locale";
import { I18N_NAMESPACES, resources, type I18nNamespace } from "@/i18n/resources";

export type { TFunction } from "i18next";
export {
  APP_LOCALE_INTL_TAGS,
  APP_LOCALE_NATIVE_NAMES,
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  isAppLocale,
  normalizeAppLocale,
  type AppLocale,
} from "@/i18n/locale";
export { I18N_NAMESPACES, type I18nNamespace } from "@/i18n/resources";

/** A fully qualified `namespace:key` usable with `i18n.t` or `t` from any namespace. */
export type I18nKey = ParseKeys<I18nNamespace[]>;

/** A `t` function bound to any namespace set; accepts fully qualified keys. */
export type AppTFunction = TFunction<I18nNamespace[]>;

export const i18n = i18next.createInstance();

void i18n.init({
  resources,
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  supportedLngs: [...APP_LOCALES],
  ns: [...I18N_NAMESPACES],
  defaultNS: "common",
  initAsync: false,
  interpolation: {
    // React escapes rendered text; double escaping would show `&amp;`.
    escapeValue: false,
  },
  returnNull: false,
  returnEmptyString: false,
  react: {
    useSuspense: false,
  },
});

export function getAppLocale(): AppLocale {
  return normalizeAppLocale(i18n.resolvedLanguage ?? i18n.language);
}

/** Apply trusted display state in a non-React process; never alter provider prompts. */
export function applyRuntimeLocale(value: unknown): AppLocale {
  const locale = normalizeAppLocale(value);
  void i18n.changeLanguage(locale);
  return locale;
}

/** BCP 47 tag for `Intl` formatters that should follow the display language. */
export function getIntlLocale(): string {
  return APP_LOCALE_INTL_TAGS[getAppLocale()];
}
