import * as stylex from "@stylexjs/stylex";
import { FolderOpen, X } from "lucide-react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";

/**
 * What the sidebar shows when its list is empty. Each state says why there
 * is nothing to list and offers the one action that fills it, so an empty
 * sidebar is a place to start rather than a dead end.
 */
export function SidebarEmptyState(
  props:
    | { kind: "no-repositories"; onOpenRepository: () => void }
    | { kind: "no-matches"; query: string; onClearSearch: () => void }
    | { kind: "no-workspaces" },
) {
  const { t } = useTranslation("workspace");
  if (props.kind === "no-repositories") {
    return (
      <div className={sx(styles.root)}>
        <p className={sx(styles.title)}>{t("emptyState.noRepositories.title")}</p>
        <p className={sx(styles.reason)}>{t("emptyState.noRepositories.reason")}</p>
        <Button variant="outline" size="sm" xstyle={styles.action} onClick={props.onOpenRepository}>
          <FolderOpen aria-hidden />
          {t("emptyState.noRepositories.action")}
        </Button>
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
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-8"],
  },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
    overflowWrap: "anywhere",
  },
  reason: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  action: { alignSelf: "flex-start", marginBlockStart: vars["--ads-space-8"] },
});
