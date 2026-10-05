import {
  APP_LOCALE_NATIVE_NAMES,
  APP_LOCALES,
  useTranslation,
  type AppLocale,
} from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { ChoiceButtons, SettingsCard } from "../settings-dialog.shared";

const LANGUAGE_OPTIONS = APP_LOCALES.map((locale) => ({
  value: locale,
  // Each language is named in its own script so it stays findable.
  label: APP_LOCALE_NATIVE_NAMES[locale],
}));

export function LanguageSettingsCard() {
  const { t } = useTranslation("settings");
  const language = useAppStore((state) => state.settings.language);
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <SettingsCard
      title={t("general.language.title")}
      description={t("general.language.description")}
    >
      <ChoiceButtons<AppLocale>
        value={language}
        aria-label={t("general.language.title")}
        options={LANGUAGE_OPTIONS}
        onChange={(next) => updateSettings({ patch: { language: next } })}
      />
    </SettingsCard>
  );
}
