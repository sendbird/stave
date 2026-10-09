import { ChevronRight } from "lucide-react";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { SectionId } from "./settings-dialog.schema";
import { LabeledField } from "./settings-dialog.shared";
import { settingsSectionsStyles as styles } from "./settings-dialog-sections.styles";

/**
 * Pointer from a provider's runtime card to Models, which owns every
 * provider's default model and effort. Rendered without the button when the
 * host cannot switch sections (e.g. a standalone render).
 */
export function ProviderDefaultsLink(args: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const navigate = args.onNavigateSection;

  return (
    <LabeledField
      title={t("settingsProviders:providersSection.defaultsLink.title")}
      description={t("settingsProviders:providersSection.defaultsLink.description")}
    >
      {navigate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          xstyle={styles.titleAccessoryButton}
          onClick={() => navigate("models")}
        >
          {t("settingsProviders:providersSection.defaultsLink.action")}
          <ChevronRight aria-hidden className={sx(styles.iconSm)} />
        </Button>
      ) : null}
    </LabeledField>
  );
}
