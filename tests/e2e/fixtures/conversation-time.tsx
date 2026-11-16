import { useState } from "react";
import { GlobalCommandPalette } from "@/components/layout/GlobalCommandPalette";
import type { CommandPaletteRuntimeContext } from "@/components/layout/command-palette-registry";
import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { ChatPanel } from "@/components/session/ChatPanel";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { TooltipProvider } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/components/aui/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
const builtin =
  BUILTIN_CUSTOM_THEMES.find((entry) => entry.id === theme) ?? null;
applyAppLocale(params.get("lang") ?? "en");
applyThemeClass({ enabled: theme === "dark" || builtin?.baseMode === "dark" });
applyCustomTheme({ theme: builtin });
useAppStore.persist.setOptions({ name: "conversation-time-fixture" });
const taskId = "conversation-time";
const messages: ChatMessage[] = [
  {
    id: "user-first",
    role: "user",
    providerId: "user",
    model: "user",
    content: "Check the settings layout and keyboard navigation.",
    parts: [],
    startedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "assistant-first",
    role: "assistant",
    providerId: "codex",
    model: "gpt-6.1-sol",
    content:
      "The settings controls are aligned. Keyboard focus follows the visual order.",
    parts: [],
    startedAt: "2026-01-02T00:00:01.000Z",
    completedAt: "2026-01-02T00:00:13.000Z",
  },
  {
    id: "user-second",
    role: "user",
    providerId: "user",
    model: "user",
    content: "Check the dark theme as well.",
    parts: [],
    startedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "assistant-second",
    role: "assistant",
    providerId: "claude-code",
    model: "claude-sonnet-4-6",
    content:
      "Both themes use the same spacing and focus treatment. The layout is ready to review.",
    parts: [],
    startedAt: "2026-01-03T00:00:01.000Z",
    completedAt: "2026-01-03T00:00:09.000Z",
  },
];
const allMessages: ChatMessage[] = params.has("offWindow")
  ? [
      {
        id: "old-export-retry",
        role: "user",
        providerId: "user",
        model: "user",
        content: "Discuss export retry after a connection failure.",
        parts: [],
      },
      ...Array.from({ length: 2399 }, (_, index): ChatMessage => ({
        id: `history-${index}`,
        role: "user",
        providerId: "user",
        model: "user",
        content: `History message ${index}`,
        parts: [],
      })),
    ]
  : messages;
window.api = {
  ...window.api,
  persistence: {
    ...window.api?.persistence,
    listWorkspaces: async () => ({ ok: true, rows: [] }),
    loadWorkspace: async () => ({ ok: true, snapshot: null }),
    upsertWorkspace: async () => ({ ok: true }),
    searchTaskContent: async (args) => {
      const matches = allMessages.filter((message) =>
        message.content.toLowerCase().includes(args.query.toLowerCase()),
      );
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 50;
      return {
        ok: true,
        results: matches.slice(offset, offset + limit).map((message) => ({
          repositoryPath: "/fixture",
          repositoryName: "Fixture",
          workspaceId: "conversation-time-ws",
          workspaceName: "Main",
          workspaceBranch: null,
          workspacePath: "/fixture",
          isDefaultWorkspace: true,
          taskId,
          title: "Settings review",
          provider: "codex",
          updatedAt: "2026-01-03T00:00:09.000Z",
          state: "completed",
          messageId: message.id,
          snippet: message.content,
          matchCount: 1,
          parentTaskId: null,
        })),
        nextOffset: offset + limit < matches.length ? offset + limit : null,
        indexing: {
          indexed: allMessages.length,
          total: allMessages.length,
          complete: true,
        },
      };
    },
    loadTaskMessages: async (args) => {
      const limit = args.limit ?? 120;
      const anchor = args.messageId
        ? allMessages.findIndex((message) => message.id === args.messageId)
        : -1;
      const offset =
        anchor >= 0
          ? Math.max(0, allMessages.length - anchor - Math.ceil(limit / 2))
          : (args.offset ?? 0);
      const start = Math.max(0, allMessages.length - offset - limit);
      const end = Math.max(0, allMessages.length - offset);
      return {
        ok: true,
        page: {
          messages: allMessages.slice(start, end),
          offset,
          limit,
          totalCount: allMessages.length,
          hasMoreOlder: start > 0,
        },
      };
    },
  },
} as typeof window.api;
useAppStore.setState({
  repositoryPath: "/fixture",
  repositoryName: "Fixture",
  activeTaskId: taskId,
  activeWorkspaceId: "conversation-time-ws",
  workspaces: [{ id: "conversation-time-ws", name: "Main" }],
  tasks: [
    {
      id: taskId,
      title: "Settings review",
      provider: "codex",
      updatedAt: "2026-01-03T00:00:09.000Z",
      unread: false,
      archivedAt: null,
    },
  ],
  messagesByTask: {
    [taskId]: params.has("offWindow") ? allMessages.slice(-120) : messages,
  },
  messageCountByTask: { [taskId]: allMessages.length },
});

function SearchPalette() {
  const [open, setOpen] = useState(true);
  const runtimeContext: CommandPaletteRuntimeContext = {
    activeEditorTabId: null,
    activeTaskId: taskId,
    activeWorkspaceIsDefault: true,
    activeWorkspacePrStatus: "no_pr",
    appShortcutKeys: normalizeAppShortcutKeys(),
    hasActiveTurn: false,
    layout: {
      sidebarOverlayTab: "explorer",
      sidebarOverlayVisible: false,
      workspaceSidebarCollapsed: false,
    },
    modifierLabel: "Ctrl",
    preferences: {
      hiddenIds: [],
      pinnedIds: [],
      recentIds: [],
      showRecent: false,
    },
    repositoryPath: "/fixture",
    repositories: [],
    tasks: [],
    workspacePath: "/fixture",
    workspaces: [],
    commands: new Proxy(
      {},
      { get: () => () => undefined },
    ) as CommandPaletteRuntimeContext["commands"],
  };
  return (
    <GlobalCommandPalette
      open={open}
      onOpenChange={setOpen}
      runtimeContext={runtimeContext}
    />
  );
}

const styles = stylex.create({
  frame: {
    height: "100vh",
    maxWidth: "60rem",
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
  },
  area: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
});

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main className={sx(styles.frame)}>
      {params.has("focusHit") ? (
        <button
          type="button"
          onClick={() =>
            void useAppStore
              .getState()
              .focusTaskAttention({
                taskId,
                workspaceId: "conversation-time-ws",
                messageId: "old-export-retry",
                searchQuery: "export retry",
                searchSnippet:
                  "Discuss export retry after a connection failure.",
              })
          }
        >
          Open matched message
        </button>
      ) : null}
      {params.has("palette") ? <SearchPalette /> : null}
      <TooltipProvider>
        <TaskScopeProvider taskId={taskId}>
          {params.has("composer") ? (
            // Stands in for ChatArea: its root tags the area Cmd/Ctrl+F finds in.
            <div data-conversation-find-scope="" className={sx(styles.area)}>
              <ChatPanel />
              <textarea aria-label="Composer stand-in" />
            </div>
          ) : (
            <ChatPanel />
          )}
          {params.has("split") ? <ChatPanel /> : null}
        </TaskScopeProvider>
      </TooltipProvider>
    </main>
  </StaveDesignProvider>,
);
