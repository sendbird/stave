import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { Plus } from "lucide-react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Button, Kbd, KbdGroup } from "@/components/ui";
import { RightRailPanelHeader, RightRailPanelTitle } from "@/components/layout/RightRailPanelShell";
import { TASK_PANEL_TABS } from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";

const IS_MAC =
  typeof window !== "undefined" &&
  (window.api?.platform === "darwin" ||
    (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)));

/**
 * The Task panel with no task open. It names what each tab will show, why
 * none is available yet, and starts the thing that fills it: a new task in
 * the selected workspace, with the shortcut that does the same.
 */
export function TaskPanelEmpty(props: { hasWorkspace: boolean }) {
  useTranslation();
  const createTask = useAppStore((state) => state.createTask);
  return (
    <div className={sx(styles.root)}>
      <RightRailPanelHeader>
        <RightRailPanelTitle panelId="task" />
      </RightRailPanelHeader>
      <div className={sx(styles.body)}>
        <div className={sx(styles.intro)}>
          <p className={sx(styles.title)}>{i18n.t("session:taskPanelEmpty.taskPanelEmpty")}</p>
          <p className={sx(styles.reason)}>
            {props.hasWorkspace
              ? i18n.t("session:taskPanelEmpty.taskPanelEmpty2")
              : i18n.t("session:taskPanelEmpty.taskPanelEmpty3")}
          </p>
        </div>
        <ul className={sx(styles.list)} aria-label={i18n.t("session:taskPanelEmpty.ariaLabel")}>
          {TASK_PANEL_TABS.map((tab, index) => (
            <li key={tab.id} className={sx(styles.row, index > 0 && styles.rowDivided)}>
              <span className={sx(styles.rowLabel)}>{tab.label}</span>
              <span className={sx(styles.rowDescription)}>{tab.description}</span>
            </li>
          ))}
        </ul>
        {props.hasWorkspace ? (
          <Button
            variant="outline"
            size="sm"
            xstyle={styles.action}
            onClick={() => createTask({ title: "" })}
          >
            <Plus aria-hidden />
            {i18n.t("session:taskPanelEmpty.taskPanelEmpty4")}<KbdGroup className={sx(styles.shortcut)}>
              <Kbd>{IS_MAC ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>N</Kbd>
            </KbdGroup>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-16"],
    overflowY: "auto",
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-12"],
  },
  intro: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"] },
  title: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
  },
  reason: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  // One surface with hairlines between its rows, not a box per row.
  list: {
    borderColor: vars["--ads-color-border-subtle"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  rowDivided: {
    borderBlockStartColor: vars["--ads-color-border-subtle"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: vars["--ads-border-width-hairline"],
  },
  rowLabel: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  rowDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  action: { alignSelf: "flex-start" },
  shortcut: { marginInlineStart: vars["--ads-space-4"] },
});
