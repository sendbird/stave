import { createRoot } from "react-dom/client";
import * as stylex from "@stylexjs/stylex";
import { ChatArea } from "@/components/session/ChatArea";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { TooltipProvider } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { applyAppLocale } from "@/i18n";
import { applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import "@/globals.css";

const params = new URLSearchParams(location.search);
applyAppLocale("en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
const taskId = "restored-task";
const workspaceId = "restore-workspace";
const kind = params.get("kind") ?? "pane";
const messages: ChatMessage[] = [{
  id: "saved-reply",
  role: "assistant",
  providerId: "codex",
  model: "gpt-6.1-sol",
  content: "The saved conversation is restored.",
  parts: [{ type: "text", text: "The saved conversation is restored." }],
}];
const reads: Array<{ workspaceId: string; taskId: string }> = [];
let settle: ((value: unknown) => void) | undefined;
window.api = {
  persistence: {
    listWorkspaces: async () => ({ ok: true, rows: [] }),
    loadWorkspace: async () => ({ ok: true, snapshot: null }),
    upsertWorkspace: async () => ({ ok: true }),
    loadTaskMessages: (args: { workspaceId: string; taskId: string }) => {
      reads.push(args);
      return new Promise((resolve) => { settle = resolve; });
    },
  },
} as unknown as Window["api"];
Object.assign(window, {
  taskRestoreFixture: {
    reads,
    complete: () => settle?.({
      ok: true,
      page: { messages, totalCount: 1, limit: 24, offset: 0, hasMoreOlder: false },
    }),
    fail: () => settle?.({ ok: false }),
  },
});
useAppStore.persist.setOptions({ name: "task-message-restore-fixture" });
useAppStore.setState({
  ...useAppStore.getInitialState(),
  hasHydratedWorkspaces: true,
  repositoryPath: "/tmp/stave-restore-fixture",
  activeWorkspaceId: workspaceId,
  // The explicit pane owns its task even when another task has focus.
  activeTaskId: "other-task",
  workspaces: [{ id: workspaceId, name: "Restore", updatedAt: "2026-10-28T00:00:00.000Z" }],
  tasks: [{
    id: "other-task",
    title: "Other task",
    provider: "codex",
    updatedAt: "2026-10-28T00:00:00.000Z",
    unread: false,
    archivedAt: null,
  }, {
    id: taskId,
    title: "Saved conversation",
    provider: "codex",
    updatedAt: "2026-10-28T00:00:00.000Z",
    unread: false,
    archivedAt: kind === "archived" ? "2026-10-28T00:01:00.000Z" : null,
  }],
  messagesByTask: { [taskId]: kind === "resident" ? messages : [] },
  messageCountByTask: { [taskId]: kind === "empty" || kind === "resident" ? 0 : 1 },
  taskWorkspaceIdById: { [taskId]: workspaceId },
});

const styles = stylex.create({
  frame: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
});

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main className={sx(styles.frame)}>
      {kind === "archived" ? (
        <button type="button" onClick={() => useAppStore.getState().restoreTask({ taskId })}>
          Reopen saved task
        </button>
      ) : null}
      <TooltipProvider><ChatArea taskId={taskId} /></TooltipProvider>
    </main>
  </StaveDesignProvider>,
);
