import { i18n, useTranslation } from "@/i18n";
import { memo, useEffect } from "react";
import { FileText, GitCompare } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import { Button, toast } from "@/components/ui";
import { getWorkspaceDocumentTitle } from "@/lib/documents/workspace-documents";
import type { WorkspaceDocumentTurnLink } from "@/lib/documents/workspace-document-schemas";
import { useAppStore } from "@/store/app.store";
import {
  EMPTY_TURN_DOCUMENT_LINKS,
  openWorkspaceDocumentRevisionDiff,
  refreshWorkspaceDocumentActivity,
  useWorkspaceDocumentsStore,
} from "@/store/workspace-documents-store";
import { turnDocumentRevisionsStyles as styles } from "./turn-document-revisions.styles";

/**
 * The workspace documents a turn wrote, under its last reply: each opens in
 * the editor or as a diff against its previous revision. Renders nothing for
 * a turn that wrote no document.
 */
export const TurnDocumentRevisions = memo(function TurnDocumentRevisions(props: {
  turnId: string;
}) {
  useTranslation();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const openDiffInEditor = useAppStore((state) => state.openDiffInEditor);
  const loaded = useWorkspaceDocumentsStore((state) =>
    Boolean(state.activityByWorkspace[workspaceId]),
  );
  const links = useWorkspaceDocumentsStore(
    (state) =>
      state.activityByWorkspace[workspaceId]?.linksByTurn[props.turnId] ??
      EMPTY_TURN_DOCUMENT_LINKS,
  );

  useEffect(() => {
    if (workspaceId && !loaded) {
      void refreshWorkspaceDocumentActivity(workspaceId);
    }
  }, [loaded, workspaceId]);

  return (
    <TurnDocumentRevisionList
      links={links}
      onOpen={(link) => void openFileFromTree({ filePath: link.filePath })}
      onCompare={(link) =>
        void openWorkspaceDocumentRevisionDiff({
          workspaceId,
          filePath: link.filePath,
          revision: link.revision,
          openDiffInEditor,
        }).then((opened) => {
          if (!opened) {
            toast.error(i18n.t("session:turnDocumentRevisions.couldNotLoad"));
          }
        })
      }
    />
  );
});

/** The list itself, without the stores, so it renders anywhere. */
export function TurnDocumentRevisionList(props: {
  links: readonly WorkspaceDocumentTurnLink[];
  onOpen: (link: WorkspaceDocumentTurnLink) => void;
  onCompare: (link: WorkspaceDocumentTurnLink) => void;
}) {
  useTranslation();
  const { links } = props;
  if (links.length === 0) {
    return null;
  }

  return (
    <div className={sx(styles.root)} data-turn-document-revisions="">
      <div className={sx(styles.header)}>
        <FileText className={sx(styles.icon)} aria-hidden="true" />
        {i18n.t("session:turnDocumentRevisions.title", { count: links.length })}
      </div>
      {links.map((link) => {
        const name = getWorkspaceDocumentTitle({ filePath: link.filePath });
        return (
          <div key={`${link.filePath}:${link.revision}`} className={sx(styles.row)}>
            <span className={sx(styles.name)} title={link.filePath}>
              {name}
            </span>
            <span className={sx(styles.revision)}>
              {i18n.t("session:turnDocumentRevisions.revision", { value1: link.revision })}
            </span>
            <div className={sx(styles.actions)}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={i18n.t("session:turnDocumentRevisions.openLabel", { value1: name })}
                onClick={() => props.onOpen(link)}
              >
                {i18n.t("session:turnDocumentRevisions.open")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={i18n.t("session:turnDocumentRevisions.changesLabel", { value1: name })}
                onClick={() => props.onCompare(link)}
              >
                <GitCompare className={sx(styles.icon)} aria-hidden="true" />
                {i18n.t("session:turnDocumentRevisions.changes")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
