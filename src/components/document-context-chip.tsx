import * as stylex from "@stylexjs/stylex";
import { FileText, X } from "lucide-react";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button, toast } from "@/components/ui";
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
      <span className={sx(styles.muted)}>
        {` · ${t("documentContext.chip.source", { workspace: args.workspaceName, revision: args.revision })}`}
      </span>
    </>
  );
  return (
    <span className={sx(styles.root, args.compact && styles.compact)} data-document-context-chip="">
      <FileText aria-hidden className={sx(styles.icon)} />
      {args.onOpen ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label={t("documentContext.chip.openAriaLabel", { title: args.title })}
          title={t("documentContext.chip.openTitle", { title: args.title })}
          onClick={args.onOpen}
          className={sx(styles.label, styles.openButton, transition.colors)}
        >
          {label}
        </Button>
      ) : (
        <span className={sx(styles.label)} title={args.title}>
          {label}
        </span>
      )}
      {args.onRemove ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={args.disabled}
          aria-label={t("documentContext.chip.removeAriaLabel", { title: args.title })}
          title={t("documentContext.chip.removeTitle")}
          onClick={args.onRemove}
          className={sx(styles.remove, transition.colors)}
        >
          <X aria-hidden className={sx(styles.removeIcon)} />
        </Button>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-accent-soft"],
    paddingInline: 8,
    paddingBlock: 4,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  compact: { paddingInline: 6, paddingBlock: 2, fontSize: vars["--ads-font-size-caption"] },
  icon: { width: 14, height: 14, flexShrink: 0 },
  label: {
    minWidth: 0,
    maxWidth: "22rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  openButton: {
    height: 20,
    paddingInline: 2,
    marginInline: -2,
    justifyContent: "flex-start",
    color: vars["--ads-color-text"],
    fontSize: "inherit",
    fontWeight: "inherit",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  muted: { color: vars["--ads-color-text-muted"], whiteSpace: "nowrap" },
  remove: {
    marginRight: -4,
    // The 28px canonical xs square keeps its hit area; the negative block
    // margin lets it sit on the chip's 20px line without growing the chip.
    marginBlock: `calc((20px - ${vars["--ads-control-height-xs"]}) / 2)`,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  removeIcon: { width: 12, height: 12 },
});
