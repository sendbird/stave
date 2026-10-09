import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import type { SectionId } from "./settings-dialog.schema";
import { LabeledField } from "./settings-dialog.shared";
import { settingsSectionsStyles as styles } from "./settings-dialog-sections.styles";

/**
 * Pointer to the one section that owns a setting, rendered where a duplicate
 * control used to live. The button is omitted when the host cannot switch
 * sections (e.g. a standalone render); the sentence still names the owner.
 */
export function SettingsSectionLink(args: {
  title: string;
  description: string;
  actionLabel: string;
  target: SectionId;
  onNavigateSection?: (id: SectionId) => void;
}) {
  const navigate = args.onNavigateSection;

  return (
    <LabeledField title={args.title} description={args.description}>
      {navigate ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          xstyle={styles.titleAccessoryButton}
          onClick={() => navigate(args.target)}
        >
          {args.actionLabel}
          <ChevronRight aria-hidden className={sx(styles.iconSm)} />
        </Button>
      ) : null}
    </LabeledField>
  );
}
