import type { StoreApi } from "zustand";
import { buildPanePanelId } from "@/lib/panes/types";
import { isTaskArchived } from "@/lib/tasks";
import {
  getCliSessionTabDefaultTitle,
  getTerminalTabDefaultTitle,
  type CliSessionContextMode,
  type WorkspaceCliSessionTab,
  type WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type { AppState } from "@/store/app-store.types";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import { removePaneTabMetaEntry } from "@/store/workspace-pane-state";
import type { ChatMessage, Task } from "@/types/chat";

type TerminalActionName =
  | "createTerminalTab"
  | "createCliSessionTab"
  | "setActiveCliSessionTab"
  | "setCliSessionTabNativeSession"
  | "renameCliSessionTab"
  | "reorderCliSessionTabs"
  | "closeCliSessionTab"
  | "renameTerminalTab"
  | "reorderTerminalTabs"
  | "closeTerminalTab";

type TerminalActions = Pick<AppState, TerminalActionName>;
type AppStoreSet = StoreApi<AppState>["setState"];
type AppStoreGet = StoreApi<AppState>["getState"];

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function findTaskById(state: Pick<AppState, "tasks">, taskId: string) {
  return state.tasks.find((task) => task.id === taskId) ?? null;
}

function findActiveTerminalLinkableTask(
  args: Pick<AppState, "tasks" | "activeTaskId">,
) {
  if (!args.activeTaskId) {
    return null;
  }
  const task = findTaskById(args, args.activeTaskId);
  if (!task || isTaskArchived(task)) {
    return null;
  }
  return task;
}

function findTerminalTabById(
  state: Pick<AppState, "terminalTabs">,
  tabId: string,
) {
  return state.terminalTabs.find((tab) => tab.id === tabId) ?? null;
}

function findCliSessionTabById(
  state: Pick<AppState, "cliSessionTabs">,
  tabId: string,
) {
  return state.cliSessionTabs.find((tab) => tab.id === tabId) ?? null;
}

function createTerminalTabRecord(args: {
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  title?: string;
  existingTitles?: string[];
}) {
  const normalizedTitle = args.title?.trim();
  const baseTitle =
    normalizedTitle ||
    getTerminalTabDefaultTitle({
      cwd: args.cwd,
      linkedTaskTitle: args.linkedTaskTitle,
    });
  const title = normalizedTitle
    ? normalizedTitle
    : (() => {
        const existingTitles = args.existingTitles ?? [];
        if (!existingTitles.includes(baseTitle)) {
          return baseTitle;
        }
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();
  return {
    id: crypto.randomUUID(),
    title,
    linkedTaskId: args.linkedTaskId,
    backend: "xterm" as const,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceTerminalTab;
}

function buildCliSessionHandoffSummary(args: {
  task: Task;
  messages: ChatMessage[];
  workspacePath: string;
}) {
  const latestUserMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  const latestAssistantMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  const lines = [
    `Continue the Stave task "${args.task.title}" in this fresh CLI session.`,
    `Workspace path: ${args.workspacePath || "current workspace"}`,
  ];

  if (latestUserMessage?.content.trim()) {
    lines.push("", "Latest user request:", latestUserMessage.content.trim());
  }
  if (latestAssistantMessage?.content.trim()) {
    lines.push(
      "",
      "Latest assistant context:",
      latestAssistantMessage.content.trim(),
    );
  }

  return lines.join("\n").trim();
}

function createCliSessionTabRecord(args: {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  handoffSummary: string;
  existingTitles?: string[];
}) {
  const baseTitle = getCliSessionTabDefaultTitle({
    providerId: args.provider,
    contextMode: args.contextMode,
    linkedTaskTitle: args.linkedTaskTitle,
  });
  const existingTitles = args.existingTitles ?? [];
  const title = !existingTitles.includes(baseTitle)
    ? baseTitle
    : (() => {
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();

  return {
    id: crypto.randomUUID(),
    title,
    provider: args.provider,
    contextMode: args.contextMode,
    linkedTaskId: args.linkedTaskId,
    linkedTaskTitle: args.linkedTaskTitle ?? null,
    handoffSummary: args.handoffSummary,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceCliSessionTab;
}

function moveItemById<T extends { id: string }>(args: {
  items: T[];
  fromId: string;
  toId: string;
}) {
  const fromIndex = args.items.findIndex((item) => item.id === args.fromId);
  const toIndex = args.items.findIndex((item) => item.id === args.toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return args.items;
  }
  const nextItems = [...args.items];
  const [moved] = nextItems.splice(fromIndex, 1);
  if (!moved) {
    return args.items;
  }
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

export function createTerminalActions(args: {
  set: AppStoreSet;
  get: AppStoreGet;
}): TerminalActions {
  const { set, get } = args;

  return {
    createTerminalTab: (args) => {
      const state = get();
      const workspaceId = state.activeWorkspaceId;
      const workspacePath =
        state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
      const cwd = args?.cwd?.trim() || workspacePath;
      if (!workspaceId || !cwd) {
        return null;
      }

      const linkedTask =
        args?.linkedTaskId === undefined
          ? findActiveTerminalLinkableTask(state)
          : args.linkedTaskId
            ? findTaskById(state, args.linkedTaskId)
            : null;
      const nextTab = createTerminalTabRecord({
        cwd,
        linkedTaskId:
          linkedTask && !isTaskArchived(linkedTask) ? linkedTask.id : null,
        linkedTaskTitle:
          linkedTask && !isTaskArchived(linkedTask) ? linkedTask.title : null,
        title: args?.title,
        existingTitles: state.terminalTabs.map((tab) => tab.title),
      });

      set((current) => ({
        terminalTabs: [...current.terminalTabs, nextTab],
        activeTerminalTabId: nextTab.id,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        activeSurface: {
          kind: "terminal",
          terminalTabId: nextTab.id,
        },
        layout: {
          ...current.layout,
          terminalDocked: true,
        },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(current),
      }));

      return nextTab.id;
    },
    createCliSessionTab: ({ provider, contextMode }) => {
      const state = get();
      const workspaceId = state.activeWorkspaceId;
      const workspacePath =
        state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
      if (!workspaceId || !workspacePath) {
        return null;
      }

      const linkedTask =
        contextMode === "active-task"
          ? findActiveTerminalLinkableTask(state)
          : null;
      if (contextMode === "active-task" && !linkedTask) {
        return null;
      }

      const nextTab = createCliSessionTabRecord({
        provider,
        contextMode,
        cwd: workspacePath,
        linkedTaskId: linkedTask?.id ?? null,
        linkedTaskTitle: linkedTask?.title ?? null,
        handoffSummary: linkedTask
          ? buildCliSessionHandoffSummary({
              task: linkedTask,
              messages: state.messagesByTask[linkedTask.id] ?? [],
              workspacePath,
            })
          : "",
        existingTitles: state.cliSessionTabs.map((tab) => tab.title),
      });

      set((current) => ({
        cliSessionTabs: [...current.cliSessionTabs, nextTab],
        activeCliSessionTabId: nextTab.id,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        activeSurface: { kind: "cli-session", cliSessionTabId: nextTab.id },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(current),
      }));

      return nextTab.id;
    },
    setActiveCliSessionTab: ({ tabId }) => {
      set((state) => {
        if (tabId === null) {
          if (
            state.activeCliSessionTabId === null &&
            state.activeAppSurface.kind === "workspace" &&
            state.activeSurface.kind === "task"
          ) {
            return state;
          }
          return {
            activeCliSessionTabId: null,
            activeAppSurface: WORKSPACE_APP_SURFACE,
            activeSurface: { kind: "task", taskId: state.activeTaskId },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        }
        if (!findCliSessionTabById(state, tabId)) {
          return state;
        }
        if (
          state.activeCliSessionTabId === tabId &&
          state.activeAppSurface.kind === "workspace" &&
          state.activeSurface.kind === "cli-session" &&
          state.activeSurface.cliSessionTabId === tabId
        ) {
          return state;
        }
        return {
          activeCliSessionTabId: tabId,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface: { kind: "cli-session", cliSessionTabId: tabId },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    setCliSessionTabNativeSession: ({ tabId, nativeSessionId }) => {
      set((state) => {
        const tab = findCliSessionTabById(state, tabId);
        const normalizedNativeSessionId = nativeSessionId?.trim() || undefined;
        if (!tab || tab.nativeSessionId === normalizedNativeSessionId) {
          return state;
        }
        return {
          cliSessionTabs: state.cliSessionTabs.map((item) =>
            item.id === tabId
              ? { ...item, nativeSessionId: normalizedNativeSessionId }
              : item,
          ),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    renameCliSessionTab: ({ tabId, title }) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        return;
      }
      set((state) => {
        const tab = findCliSessionTabById(state, tabId);
        if (!tab || tab.title === normalizedTitle) {
          return state;
        }
        return {
          cliSessionTabs: state.cliSessionTabs.map((item) =>
            item.id === tabId ? { ...item, title: normalizedTitle } : item,
          ),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    reorderCliSessionTabs: ({ fromTabId, toTabId }) => {
      set((state) => {
        const nextTabs = moveItemById({
          items: state.cliSessionTabs,
          fromId: fromTabId,
          toId: toTabId,
        });
        if (nextTabs === state.cliSessionTabs) {
          return state;
        }
        return {
          cliSessionTabs: nextTabs,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    closeCliSessionTab: ({ tabId }) => {
      set((state) => {
        const closingIndex = state.cliSessionTabs.findIndex(
          (tab) => tab.id === tabId,
        );
        if (closingIndex < 0) {
          return state;
        }
        const nextTabs = state.cliSessionTabs.filter((tab) => tab.id !== tabId);
        const fallbackTab =
          nextTabs[Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))] ??
          null;
        const nextActiveCliSessionTabId =
          state.activeCliSessionTabId === tabId
            ? (fallbackTab?.id ?? null)
            : state.activeCliSessionTabId;
        return {
          cliSessionTabs: nextTabs,
          activeCliSessionTabId: nextActiveCliSessionTabId,
          activeSurface:
            state.activeSurface.kind === "cli-session" &&
            state.activeSurface.cliSessionTabId === tabId
              ? fallbackTab
                ? { kind: "cli-session", cliSessionTabId: fallbackTab.id }
                : { kind: "task", taskId: state.activeTaskId }
              : state.activeSurface,
          paneTabMeta: removePaneTabMetaEntry({
            paneTabMeta: state.paneTabMeta,
            panelId: buildPanePanelId({
              kind: "cli-session",
              cliSessionTabId: tabId,
            }),
          }),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    renameTerminalTab: ({ tabId, title }) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        return;
      }
      set((state) => {
        const tab = findTerminalTabById(state, tabId);
        if (!tab || tab.title === normalizedTitle) {
          return state;
        }
        return {
          terminalTabs: state.terminalTabs.map((item) =>
            item.id === tabId ? { ...item, title: normalizedTitle } : item,
          ),
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    reorderTerminalTabs: ({ fromTabId, toTabId }) => {
      set((state) => {
        const nextTabs = moveItemById({
          items: state.terminalTabs,
          fromId: fromTabId,
          toId: toTabId,
        });
        if (nextTabs === state.terminalTabs) {
          return state;
        }
        return {
          terminalTabs: nextTabs,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    closeTerminalTab: ({ tabId }) => {
      set((state) => {
        const closingIndex = state.terminalTabs.findIndex(
          (tab) => tab.id === tabId,
        );
        if (closingIndex < 0) {
          return state;
        }
        const nextTabs = state.terminalTabs.filter((tab) => tab.id !== tabId);
        const fallbackTab =
          nextTabs[Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))] ??
          null;
        const nextActiveTerminalTabId =
          state.activeTerminalTabId === tabId
            ? (fallbackTab?.id ?? null)
            : state.activeTerminalTabId;
        return {
          terminalTabs: nextTabs,
          activeTerminalTabId: nextActiveTerminalTabId,
          activeSurface:
            state.activeSurface.kind === "terminal" &&
            state.activeSurface.terminalTabId === tabId
              ? fallbackTab
                ? { kind: "terminal", terminalTabId: fallbackTab.id }
                : { kind: "task", taskId: state.activeTaskId }
              : state.activeSurface,
          paneTabMeta: removePaneTabMetaEntry({
            paneTabMeta: state.paneTabMeta,
            panelId: buildPanePanelId({
              kind: "terminal",
              terminalTabId: tabId,
            }),
          }),
          layout:
            nextTabs.length === 0
              ? {
                  ...state.layout,
                  terminalDocked: false,
                }
              : state.layout,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
  };
}
