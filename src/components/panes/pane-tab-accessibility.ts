import { i18n } from "@/i18n";
import { COMMIT_GRAPH_TITLE_KEY } from "@/lib/git-graph/presentation";
import { parsePanePanelId, type PaneSurfaceDescriptor } from "@/lib/panes/types";
import { resolvePathBaseName } from "@/lib/path-utils";
import type { AppState } from "@/store/app-store.types";
import type { ChatMessage } from "@/types/chat";
import { isGitGraphEditorTab } from "./editor-tab-presentation";
import type { LensTabState } from "./lens-tab-state";

/**
 * What a pane tab is called: a custom name the user gave it, else its task's
 * title, file name, terminal title or page title. The same words are shown on
 * the tab, read as its accessible name and spoken when it opens.
 */
export function resolvePaneSurfaceTitle(
  state: Pick<AppState, "paneTabMeta" | "tasks" | "cliSessionTabs" | "terminalTabs" | "editorTabs">,
  surface: PaneSurfaceDescriptor,
  panelId: string,
  lensState?: Pick<LensTabState, "title" | "url"> | null,
): string {
  const customTitle = state.paneTabMeta[panelId]?.customTitle;
  if (customTitle?.trim()) {
    return customTitle;
  }
  switch (surface.kind) {
    case "task":
      return (
        state.tasks.find((task) => task.id === surface.taskId)?.title ??
        i18n.t("panes:paneTabChip.task")
      );
    case "cli-session":
      return (
        state.cliSessionTabs.find((tab) => tab.id === surface.cliSessionTabId)
          ?.title ?? i18n.t("panes:paneTabChip.cLISession")
      );
    case "terminal":
      return (
        state.terminalTabs.find((tab) => tab.id === surface.terminalTabId)
          ?.title ?? i18n.t("panes:paneTabChip.terminal")
      );
    case "editor": {
      const editorTab = state.editorTabs.find(
        (tab) => tab.id === surface.editorTabId,
      );
      return editorTab
        ? isGitGraphEditorTab(editorTab)
          ? i18n.t(COMMIT_GRAPH_TITLE_KEY)
          : resolvePathBaseName({
              path: editorTab.filePath,
              fallback: i18n.t("panes:paneTabChip.editor"),
            })
        : i18n.t("panes:paneTabChip.editor");
    }
    case "lens":
      return lensState?.title?.trim() || lensState?.url?.trim() || "Lens";
    case "compare-run":
      return i18n.t("panes:paneTabChip.compareRun");
  }
}

export type PaneTabTaskStatus = "awaitingApproval" | "awaitingInput" | "stalled" | "working";

/**
 * Whether the running turn is waiting on a person. Only the running turn's
 * own messages are read, newest first, so a tab never scans a long history on
 * every store update.
 */
export function findActiveTurnPendingInteraction(
  messages: readonly ChatMessage[],
  turnId: string,
): "approval" | "user_input" | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.turnId && message.turnId !== turnId) {
      break;
    }
    for (const part of message.parts) {
      if (part.type === "approval" && part.state === "approval-requested") {
        return "approval";
      }
      if (part.type === "user_input" && part.state === "input-requested") {
        return "user_input";
      }
    }
  }
  return null;
}

export function resolvePaneTabTaskStatus(args: {
  isResponding: boolean;
  isStalled: boolean;
  waiting: "approval" | "user_input" | null;
}): PaneTabTaskStatus | null {
  if (args.waiting === "approval") return "awaitingApproval";
  if (args.waiting === "user_input") return "awaitingInput";
  if (args.isStalled) return "stalled";
  return args.isResponding ? "working" : null;
}

/** "Persist sidebar state, Claude, awaiting approval". */
export function describePaneTabAccessibleName(args: {
  title: string;
  provider?: string | null;
  status?: PaneTabTaskStatus | null;
}): string {
  const status = args.status ? i18n.t(`panes:paneTabChip.status.${args.status}`) : null;
  if (args.provider && status) {
    return i18n.t("panes:paneTabChip.accessibleNameFull", { title: args.title, provider: args.provider, status });
  }
  if (args.provider || status) {
    return i18n.t("panes:paneTabChip.accessibleNamePart", { title: args.title, detail: args.provider ?? status });
  }
  return args.title;
}

/**
 * Dockview's live region says "<title> opened" with the panel id as the
 * title. Opening and closing a pane are announced by the tab's own words
 * ("Opened Persist sidebar state"); other layout changes keep Dockview's
 * defaults, which read the panel title set by the tab.
 */
export function describePaneAnnouncement(
  event: { kind: string; panel: { id: string } },
  state: Parameters<typeof resolvePaneSurfaceTitle>[0],
  lensState?: (lensSessionId: string) => Pick<LensTabState, "title" | "url"> | null,
): string | undefined {
  if (event.kind !== "open" && event.kind !== "close") {
    return undefined;
  }
  const surface = parsePanePanelId(event.panel.id);
  if (!surface) {
    return undefined;
  }
  const title = resolvePaneSurfaceTitle(
    state,
    surface,
    event.panel.id,
    surface.kind === "lens" ? lensState?.(surface.lensSessionId) : null,
  );
  return event.kind === "open"
    ? i18n.t("panes:paneTabChip.opened", { title })
    : i18n.t("panes:paneTabChip.closed", { title });
}
