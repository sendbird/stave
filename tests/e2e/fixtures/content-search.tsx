import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { FleetView } from "@/components/layout/FleetView";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import { useAppStore } from "@/store/app.store";
import { applyThemeClass } from "@/lib/themes/apply";
import type { ContentSearchResult } from "@/lib/task-search/content-search";
import "@/components/aui/styles.css";
import "@/globals.css";

const params = new URLSearchParams(location.search);
applyAppLocale(params.get("lang") === "ko" ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "content-search-fixture" });
const workspaceId = "ws-content";
const taskId = "task-content";
const repositoryPath = "/tmp/content-search-fixture";
const now = new Date().toISOString();
const result: ContentSearchResult = {
  repositoryPath, repositoryName: "workspace", workspaceId, workspaceName: "Search work",
  workspaceBranch: "main", workspacePath: repositoryPath, isDefaultWorkspace: true,
  taskId, title: "Investigate delivery", provider: "codex", updatedAt: now,
  state: "archived", messageId: "message-export-retry", matchCount: 3, parentTaskId: "parent-task",
  snippet: "We discussed the export retry. 내보내기 재시도는 잠시 후 진행합니다.",
};
const api = ((window as unknown as { api?: Record<string, unknown> }).api ??= {});
api.persistence = {
  searchTaskContent: async ({ query }: { query: string }) => ({
    ok: true, results: result.snippet.toLowerCase().includes(query.toLowerCase()) ? [result] : [],
    nextOffset: null, indexing: { indexed: 200, total: 200, complete: true },
  }),
};
const opened: unknown[] = [];
(window as unknown as { __contentSearchOpened: unknown[] }).__contentSearchOpened = opened;
useAppStore.setState({
  repositoryPath, repositoryName: "workspace", activeWorkspaceId: workspaceId,
  workspaces: [{ id: workspaceId, name: "Search work", updatedAt: now }],
  workspaceDefaultById: { [workspaceId]: true }, workspaceBranchById: { [workspaceId]: "main" },
  workspacePathById: { [workspaceId]: repositoryPath }, recentRepositories: [],
  tasks: [{ id: "title-task", title: "Review tests", provider: "codex", updatedAt: now, unread: false, archivedAt: null }],
  messagesByTask: {}, openTaskTabIds: ["title-task"], activeTaskId: "title-task",
  focusTaskAttention: async (target) => { opened.push(target); },
});
createRoot(document.getElementById("root")!).render(<StaveDesignProvider><FleetView /></StaveDesignProvider>);
