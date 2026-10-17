import * as stylex from "@stylexjs/stylex";
import { FileText } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import {
  Button,
  ContextChip,
  ContextChipRemoveButton,
  contextChipStyles,
  toast,
} from "@/components/ui";
import { i18n, useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { openWorkspaceDocumentRevisionDiff } from "@/store/workspace-documents-store";

/**
 * Opens the attached revision of another workspace's document, read-only,
 * against its previous recorded revision (or empty when that is gone).
 */
export function openAttachedDocument(document: {
  workspaceId: string;
  filePath: string;
  revision: number;
}) {
  void openWorkspaceDocumentRevisionDiff({
    workspaceId: document.workspaceId,
    filePath: document.filePath,
    revision: document.revision,
    foreign: true,
    openDiffInEditor: useAppStore.getState().openDiffInEditor,
  }).then((opened) => {
    if (!opened) {
      toast.error(i18n.t("workspace:documentContext.chip.couldNotOpen"));
    }
  });
}

/**
 * Another workspace's document attached as context. The title opens the
 * attached revision; in the composer it can be removed.
 */
export function DocumentContextChip(args: {
  title: string;
  workspaceName: string;
  revision: number;
  disabled?: boolean;
  compact?: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation(["workspace"]);
  const label = (
    <>
      <span>{args.title}</span>
      <span className={sx(contextChipStyles.muted)}>
        {` · ${t("documentContext.chip.source", { workspace: args.workspaceName, revision: args.revision })}`}
      </span>
    </>
  );
  return (
    <ContextChip icon={FileText} compact={args.compact} data-document-context-chip="">
      {args.onOpen ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={t("documentContext.chip.openAriaLabel", { title: args.title })}
          title={t("documentContext.chip.openTitle", { title: args.title })}
          onClick={args.onOpen}
          xstyle={[contextChipStyles.label, styles.label, contextChipStyles.openButton, transition.colors]}
        >
          {label}
        </Button>
      ) : (
        <span className={sx(contextChipStyles.label, styles.label)} title={args.title}>
          {label}
        </span>
      )}
      {args.onRemove ? (
        <ContextChipRemoveButton
          disabled={args.disabled}
          label={t("documentContext.chip.removeAriaLabel", { title: args.title })}
          title={t("documentContext.chip.removeTitle")}
          onClick={args.onRemove}
        />
      ) : null}
    </ContextChip>
  );
}

const styles = stylex.create({
  label: { maxWidth: "22rem" },
});
