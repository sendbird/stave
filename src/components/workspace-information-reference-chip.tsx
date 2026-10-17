import { useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { Info } from "lucide-react";
import { Tooltip } from "@/components/ads/components/Tooltip";
import {
  ContextChip,
  ContextChipRemoveButton,
  contextChipStyles,
} from "@/components/ui";
import {
  getWorkspaceInformationReferenceLabel,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";

export function WorkspaceInformationReferenceChip(args: {
  reference: WorkspaceInformationReference;
  disabled?: boolean;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const label = getWorkspaceInformationReferenceLabel(args.reference);
  const scopeLabel = args.reference.scope === "section" ? tI18n("workspace:workspaceInformationReferenceChip.section") : tI18n("workspace:workspaceInformationReferenceChip.item");
  return (
    <ContextChip icon={Info} compact={args.compact}>
      <span className={sx(contextChipStyles.label)} title={label}>
        <span className={sx(contextChipStyles.prefix)}>{tI18n("workspace:workspaceInformationReferenceChip.information")}</span>
        <span className={sx(contextChipStyles.muted)}> / {scopeLabel} / </span>
        <span>{label}</span>
      </span>
      {args.onRemove ? (
        <Tooltip content={tI18n("workspace:workspaceInformationReferenceChip.removeInformationReference")}>
          <ContextChipRemoveButton
            disabled={args.disabled}
            label={tI18n("workspace:workspaceInformationReferenceChip.removeValue", { label: label })}
            onClick={args.onRemove}
          />
        </Tooltip>
      ) : null}
    </ContextChip>
  );
}
