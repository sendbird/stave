import * as stylex from "@stylexjs/stylex";
import { FolderOpen, X } from "lucide-react";
import { vars } from "../aui/tokens/tokens.stylex";
import { sx } from "../aui/utils/stylex";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";

/**
 * What the sidebar shows when its list is empty. Each state says why there
 * is nothing to list and offers the one action that fills it, so an empty
 * sidebar is a place to start rather than a dead end.
 */
export function SidebarEmptyState(
  props:
    | { kind: "no-repositories"; onOpenRepository: () => void; hideAction?: boolean }
    | { kind: "no-matches"; query: string; onClearSearch: () => void }
    | { kind: "no-workspaces"; onNewWorkspace?: () => void },
) {
  const { t } = useTranslation("workspace");
  if (props.kind === "no-repositories") {
    return (
      <div className={sx(styles.root)}>
        <p className={sx(styles.title)}>{t("emptyState.noRepositories.title")}</p>
        <p className={sx(styles.reason)}>{t("emptyState.noRepositories.reason")}</p>
        {!props.hideAction ? <Button variant="outline" size="sm" xstyle={styles.action} onClick={props.onOpenRepository}>
          <FolderOpen aria-hidden />
          {t("emptyState.noRepositories.action")}
        </Button> : null}
      </div>
    );
  }
  if (props.kind === "no-matches") {
    return (
      <div className={sx(styles.root)}>
        <p className={sx(styles.title)}>{t("emptyState.noMatches.title", { query: props.query.trim() })}</p>
        <p className={sx(styles.reason)}>{t("emptyState.noMatches.reason")}</p>
        <Button variant="ghost" size="sm" xstyle={styles.action} onClick={props.onClearSearch}>
          <X aria-hidden />
          {t("emptyState.noMatches.action")}
        </Button>
      </div>
    );
  }
  return (
    <div className={sx(styles.root)}>
      <p className={sx(styles.title)}>{t("emptyState.noWorkspaces.title")}</p>
      <p className={sx(styles.reason)}>{t("emptyState.noWorkspaces.reason")}</p>
      {props.onNewWorkspace ? <Button size="sm" onClick={props.onNewWorkspace}>{t("repositoryWorkspaceSidebar.newWorkspace")}</Button> : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-8"],
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  reason: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    margin: 0,
  },
  action: { alignSelf: "flex-start", marginBlockStart: vars["--aui-space-8"] },
});
