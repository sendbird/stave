import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { TurnFileActions, UndoFileRestore } from "@/components/session/TurnFileActions";
import { ForkReturnAction } from "@/components/session/ForkReturnAction";
import { ConversationTurnActions } from "@/components/session/ConversationTurnActions";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TooltipProvider } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { applyThemeClass } from "@/lib/themes/apply";
import { buildConversationTurnActionStateByMessageId } from "@/lib/providers/thread-actions";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/components/aui/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
const providerId = params.get("provider") === "claude-code" ? "claude-code" : "codex";
applyAppLocale(params.get("lang") ?? "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
document.documentElement.dataset.uiDensity = params.get("density") ?? "regular";
useAppStore.persist.setOptions({ name: "turn-snapshots-fixture" });
const taskId = "snapshot-task";
const messages: ChatMessage[] = [
  { id: "user-first", turnId: "turn-first", role: "user", providerId: "user", model: "user", content: "Check the settings.", parts: [] },
  { id: "assistant-first", role: "assistant", providerId, model: "model", content: "The settings are ready.", parts: [], turnId: "turn-first", nativeProviderSessionId: "session", nativeProviderTurnId: "native-first" },
  { id: "user-second", turnId: "turn-second", role: "user", providerId: "user", model: "user", content: "Check navigation.", parts: [] },
  { id: "assistant-second", role: "assistant", providerId, model: "model", content: "Navigation is ready.", parts: [], turnId: "turn-second", nativeProviderSessionId: "session", nativeProviderTurnId: "native-second" },
];
Object.assign(window, { __turnSnapshotFixtureStore: useAppStore, __turnSnapshotCalls: [] });
const calls: unknown[] = [];
let canUndo = false;
Object.assign(window, { __turnSnapshotCalls: calls });
window.api = {
  ...window.api,
  turnSnapshots: {
    list: async () => ({ snapshots: [{ turnId: "turn-first", snapshotId: "snapshot-first", createdAt: "2026-01-01" }], skipped: [{ turnId: "turn-second", reason: "captureFailed" }], canUndo }),
    restore: async (args) => {
      calls.push({ method: "restore", ...args });
      if (!params.has("refuse")) canUndo = true;
      return params.has("refuse") ? { ok: false, reason: "otherTaskChanges" } : { ok: true, detail: "Restored" };
    },
    undo: async (args) => {
      calls.push({ method: "undo", ...args });
      canUndo = false;
      return { ok: true, detail: "Undone" };
    },
  },
  persistence: { ...window.api?.persistence, truncateTaskMessagesAfter: async () => ({ ok: true }) },
  provider: { ...window.api?.provider, rollbackCodexThread: async () => ({ ok: true, detail: "Rolled back", threadId: "session" }), cleanupTask: async () => ({ ok: true }) },
} as typeof window.api;
useAppStore.setState({
  hasHydratedWorkspaces: true,
  repositoryPath: "/fixture",
  repositoryName: "Fixture",
  activeTaskId: taskId,
  openTaskTabIds: [taskId],
  activeSurface: { kind: "task", taskId },
  activeWorkspaceId: "snapshot-ws",
  workspacePathById: { "snapshot-ws": "/fixture" },
  taskWorkspaceIdById: { original: "snapshot-ws", [taskId]: "snapshot-ws" },
  workspaces: [{ id: "snapshot-ws", name: "Main" }],
  tasks: [{ id: "original", title: "Original", provider: providerId, updatedAt: "2026-01-01", unread: false, controlMode: "interactive", controlOwner: "stave" }, { id: taskId, forkParent: { taskId: "original", workspaceId: "snapshot-ws", messageId: "original-answer" }, title: "Settings review", provider: providerId, updatedAt: "2026-01-01", unread: false, controlMode: "interactive", controlOwner: "stave" }],
  messagesByTask: { original: [], [taskId]: messages },
  messageCountByTask: { [taskId]: messages.length },
  providerSessionByTask: { [taskId]: { [providerId]: { nativeSessionId: "session", syncedThroughMessageId: "assistant-second" } } },
});
const state = buildConversationTurnActionStateByMessageId({ messages, providerSession: useAppStore.getState().providerSessionByTask[taskId], hasActiveTurn: false }).get("assistant-first")!;
const styles = stylex.create({
  frame: { minHeight: "100vh", backgroundColor: vars["--aui-color-canvas"], color: vars["--aui-color-text"], padding: vars["--aui-space-24"] },
  row: { maxWidth: "48rem", marginInline: "auto" },
});
createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <TooltipProvider>
      <main className={sx(styles.frame)}>
        <div className={sx(styles.row)}>
          <ConversationTurnActions taskId={taskId} messageId="assistant-first" state={state} variant="preview" />
          <div data-testid="second-turn-files"><TurnFileActions taskId={taskId} messageId="assistant-second" /></div>
          <ForkReturnAction taskId={taskId} messageId="assistant-second" />
          <UndoFileRestore taskId={taskId} />
        </div>
      </main>
    </TooltipProvider>
  </StaveDesignProvider>,
);
