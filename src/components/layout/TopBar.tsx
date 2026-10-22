import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import {
  FolderTree,
  SquareTerminal,
  FolderOpen,
  ChevronDown,
  Copy,
  GitGraph,
  PanelLeft,
} from "lucide-react";
import { GhosttyIcon, VSCodeIcon } from "@/components/brand-icons";
import * as stylex from "@stylexjs/stylex";
import { useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  COMMIT_GRAPH_TITLE_KEY,
  OPEN_COMMIT_GRAPH_TITLE_KEY,
} from "@/lib/git-graph/presentation";
import { focusOrCreateGitGraphSurface } from "@/components/panes/pane-host-controller";
import { resolveOpenableGitGraphWorkspaceId } from "@/store/app-store-editor-actions";
import { useAppStore } from "@/store/app.store";
import { TopBarBranchDropdown } from "@/components/layout/TopBarBranchDropdown";
import { TopBarFileSearch } from "@/components/layout/TopBarFileSearch";
import { TopBarFleetAttention } from "@/components/layout/TopBarFleetAttention";
import { TopBarNotifications } from "@/components/layout/TopBarNotifications";
import { TopBarOpenPR } from "@/components/layout/TopBarOpenPR";
import { TopBarAutomations } from "@/components/layout/TopBarAutomations";
import { TopBarIssues } from "@/components/layout/TopBarIssues";
import { TopBarStandaloneCli } from "@/components/layout/TopBarStandaloneCli";
import { TopBarUpdate } from "@/components/layout/TopBarUpdate";
import { TopBarWindowControls } from "@/components/layout/TopBarWindowControls";
import { formatWorkspacePathLabel } from "@/store/repository.utils";
import { useShortcutHint } from "@/components/system/ShortcutKeys";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import { topBarControlStyles, topBarStyles } from "./top-bar.styles";

const IS_MAC =
  typeof window !== "undefined" && window.api?.platform === "darwin";
const TOP_BAR_DRAG_STYLE = { WebkitAppRegion: "drag" } as CSSProperties;
const TOP_BAR_NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function TopBar() {
  useTranslation();
  const [workspacePathMenuOpen, setWorkspacePathMenuOpen] = useState(false);
  const [
    activeWorkspaceId,
    workspaces,
    workspacePathById,
    repositoryPath,
    workspaceSidebarCollapsed,
    setLayout,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
          state.workspaces,
          state.workspacePathById,
          state.repositoryPath,
          state.layout.workspaceSidebarCollapsed,
          state.setLayout,
        ] as const,
    ),
  );
  const sidebarShortcut = useShortcutHint("view.toggle-workspace-sidebar");
  const hasRepositoryContext = Boolean(repositoryPath?.trim());
  const activeWorkspacePath = hasRepositoryContext
    ? (workspacePathById[activeWorkspaceId] ?? repositoryPath ?? "")
    : "";
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: activeWorkspacePath,
    repositoryPath,
  });
  const canOpenGitGraph = Boolean(
    resolveOpenableGitGraphWorkspaceId({
      activeWorkspaceId,
      repositoryPath,
      workspaces,
      workspacePathById,
    }),
  );

  // The bar reads in four labelled groups: where you are (path, branch,
  // Commit graph, PR) leads, then search, the views the bar opens and the
  // app's own alerts trail, with a rule between the trailing groups. Every
  // tooltip is the ADS `Tooltip` below the control, with the keys when a
  // shortcut exists.
  return (
    <header
      data-testid="top-bar"
      className={sx(topBarStyles.header)}
      style={TOP_BAR_DRAG_STYLE}
    >
      <div className={sx(topBarStyles.content)}>
        <div className={sx(topBarStyles.lead)}>
          {workspaceSidebarCollapsed ? (
            <Tooltip
              content={i18n.t("shell:topBar.expandRepositoryList")}
              shortcut={sidebarShortcut}
              side="bottom"
            >
              <Button
                variant="ghost"
                size="sm"
                xstyle={topBarStyles.sidebarToggle}
                style={TOP_BAR_NO_DRAG_STYLE}
                onClick={() =>
                  setLayout({
                    patch: { workspaceSidebarCollapsed: false },
                  })
                }
                aria-label={i18n.t("shell:topBar.expandProjectList")}
              >
                <PanelLeft />
              </Button>
            </Tooltip>
          ) : null}
          {hasRepositoryContext ? (
            <div
              className={sx(topBarStyles.locationGroup)}
              role="group"
              aria-label={i18n.t("shell:topBar.location")}
            >
              {activeWorkspacePath ? (
                <div
                  className={sx(topBarStyles.pathGroup)}
                  style={TOP_BAR_NO_DRAG_STYLE}
                >
                  <Tooltip content={activeWorkspacePath} side="bottom">
                    <div
                      className={sx(
                        // The leading half of a segmented pair, so it needs the
                        // same 32px geometry and bordered fill its own trailing
                        // trigger already composes. Rendering `pathChip` alone
                        // left the chip with no height, no border and no type
                        // step: the path inherited the 16px document size while
                        // every sibling control in the row ran at 12px, and the
                        // pair read as a floating mono string welded to a
                        // button.
                        topBarControlStyles.control,
                        topBarControlStyles.surface,
                        // `surface` states a `:hover` fill AND a `:hover` ink,
                        // and this is the one place it lands on a plain `div`
                        // instead of an ADS `Button` (which composes
                        // `transition.control` itself). So the leading half of
                        // this segmented pair cut instantly to its hover colour
                        // while the chevron half beside it faded — the two
                        // halves of one control disagreeing about how a hover
                        // arrives.
                        transition.colors,
                        topBarStyles.pathChip,
                      )}
                    >
                      <FolderTree {...stylex.props(topBarControlStyles.icon)} />
                      <span className={sx(topBarStyles.pathLabel)}>
                        {workspacePathLabel}
                      </span>
                    </div>
                  </Tooltip>
                  <DropdownMenu
                    open={workspacePathMenuOpen}
                    onOpenChange={setWorkspacePathMenuOpen}
                  >
                    <Tooltip content={i18n.t("shell:topBar.openIn")} side="bottom">
                      <span {...stylex.props(layoutShellStyles.inlineFlex)}>
                        <DropdownMenuTrigger
                          render={
                            <AdsButton
                              layout="host"
                              size="sm"
                              type="button"
                              xstyle={[
                                topBarControlStyles.control,
                                topBarControlStyles.surface,
                                topBarControlStyles.iconOnly,
                                topBarStyles.pathMenuTrigger,
                              ]}
                              aria-label={i18n.t("shell:topBar.pathActions")}
                            />
                          }
                        >
                          <ChevronDown />
                        </DropdownMenuTrigger>
                      </span>
                    </Tooltip>
                    <DropdownMenuContent
                      align="start"
                      xstyle={topBarStyles.pathMenu}
                    >
                      <DropdownMenuItem
                        onSelect={() => {
                          setWorkspacePathMenuOpen(false);
                          void window.api?.shell?.showInFinder?.({
                            path: activeWorkspacePath,
                          });
                        }}
                      >
                        <FolderOpen {...stylex.props(layoutShellStyles.icon16)} />
                        {i18n.t("shell:topBar.openInFinder")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setWorkspacePathMenuOpen(false);
                          void window.api?.shell?.openInVSCode?.({
                            path: activeWorkspacePath,
                          });
                        }}
                      >
                        <VSCodeIcon {...stylex.props(layoutShellStyles.icon16)} />
                        {i18n.t("shell:topBar.openInVSCode")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setWorkspacePathMenuOpen(false);
                          void window.api?.shell?.openInGhostty?.({
                            path: activeWorkspacePath,
                          });
                        }}
                      >
                        <GhosttyIcon {...stylex.props(layoutShellStyles.icon16)} />
                        {i18n.t("shell:topBar.openInGhostty")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setWorkspacePathMenuOpen(false);
                          void window.api?.shell?.openInTerminal?.({
                            path: activeWorkspacePath,
                          });
                        }}
                      >
                        <SquareTerminal
                          {...stylex.props(layoutShellStyles.icon16)}
                        />
                        {i18n.t("shell:topBar.openInTerminal")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          setWorkspacePathMenuOpen(false);
                          void copyTextToClipboard(activeWorkspacePath).then(
                            () =>
                              toast.success(
                                i18n.t("shell:topBar.workspacePathCopied"),
                              ),
                            () =>
                              toast.error(
                                i18n.t("shell:topBar.couldNotCopyWorkspacePath"),
                              ),
                          );
                        }}
                      >
                        <Copy {...stylex.props(layoutShellStyles.icon16)} />
                        {i18n.t("shell:topBar.copyWorkspacePath")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
              <TopBarBranchDropdown noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
              <Tooltip
                content={
                  canOpenGitGraph
                    ? i18n.t(OPEN_COMMIT_GRAPH_TITLE_KEY)
                    : i18n.t("shell:topBar.selectAnActiveWorkspaceToOpenThe")
                }
                side="bottom"
              >
                <span {...stylex.props(layoutShellStyles.inlineFlex)}>
                  {/* The same host-layout `sm` control and bordered fill as the
                      branch switcher and PR trigger beside it, so the row reads
                      as one set of controls. */}
                  <AdsButton
                    layout="host"
                    size="sm"
                    type="button"
                    xstyle={[
                      topBarControlStyles.control,
                      topBarControlStyles.surface,
                      topBarStyles.gitGraphButton,
                    ]}
                    style={TOP_BAR_NO_DRAG_STYLE}
                    disabled={!canOpenGitGraph}
                    onClick={focusOrCreateGitGraphSurface}
                    aria-label={i18n.t(COMMIT_GRAPH_TITLE_KEY)}
                  >
                    <GitGraph />
                    <span className={sx(topBarStyles.collapsibleLabel)}>
                      {i18n.t(COMMIT_GRAPH_TITLE_KEY)}
                    </span>
                  </AdsButton>
                </span>
              </Tooltip>
              <TopBarOpenPR
                key={`${activeWorkspaceId}:${activeWorkspacePath}`}
                noDragStyle={TOP_BAR_NO_DRAG_STYLE}
              />
            </div>
          ) : null}
        </div>
        <div className={sx(topBarStyles.trail)}>
          {hasRepositoryContext ? (
            <div
              className={sx(topBarStyles.searchSlot)}
              role="group"
              aria-label={i18n.t("shell:topBar.search")}
            >
              <TopBarFileSearch noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            </div>
          ) : null}
          <div
            className={sx(
              topBarStyles.actionGroup,
              hasRepositoryContext && topBarStyles.ruledGroup,
            )}
            role="group"
            aria-label={i18n.t("shell:topBar.views")}
          >
            {hasRepositoryContext ? (
              <TopBarFleetAttention noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            ) : null}
            <TopBarIssues noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            <TopBarAutomations noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            <TopBarStandaloneCli noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          </div>
          {/* Notifications only exist inside a repository and Update hides
              where the build cannot update itself, so this group can be empty;
              `ruledGroup` then hides it together with its rule. */}
          <div
            className={sx(topBarStyles.actionGroup, topBarStyles.ruledGroup)}
            role="group"
            aria-label={i18n.t("shell:topBar.app")}
          >
            {hasRepositoryContext ? (
              <TopBarNotifications noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
            ) : null}
            <TopBarUpdate noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
          </div>
        </div>
      </div>
      {IS_MAC ? null : (
        <div
          className={sx(topBarStyles.windowControls)}
          style={TOP_BAR_NO_DRAG_STYLE}
        >
          <TopBarWindowControls noDragStyle={TOP_BAR_NO_DRAG_STYLE} />
        </div>
      )}
    </header>
  );
}
