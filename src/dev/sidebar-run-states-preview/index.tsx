import { applyAppLocale, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useState } from "react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { repositorySidebarStyles as s } from "@/components/layout/repository-workspace-sidebar.styles";
import {
  InlineWorkspaceLabel,
  WorkspaceRowSecondary,
  WorkspaceLeadingStatusIcon,
} from "@/components/layout/workspace-sidebar-rows";
import { TooltipProvider } from "@/components/ui";
import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import {
  applyProviderTurnActivityEvents,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, Task } from "@/types/chat";

const params = new URLSearchParams(window.location.search);

interface PreviewRow {
  id: string;
  name: string;
  branch: string;
  providerId: ProviderId;
  isDefault?: boolean;
  busy?: boolean;
  attentionKind?: FleetAttentionKind;
  /** Events the turn reported, oldest first, each `msAgo` before now. */
  batches?: { msAgo: number; events: NormalizedProviderEvent[] }[];
  stalledMsAgo?: number;
  todos?: { done: number; total: number };
}

function tool(
  toolUseId: string,
  toolName: string,
  input: Record<string, unknown> = {},
  extra: Partial<Extract<NormalizedProviderEvent, { type: "tool" }>> = {},
): NormalizedProviderEvent {
  return { type: "tool", toolUseId, toolName, input: JSON.stringify(input), state: "input-available", ...extra };
}

const ROWS: PreviewRow[] = [
  { id: "default", name: "Default", branch: "main", isDefault: true, providerId: "codex" },
  { id: "default-long", name: "Default", branch: "feat/a-long-branch-name-that-must-truncate", isDefault: true, providerId: "codex" },
  { id: "default-no-branch", name: "Default", branch: "", isDefault: true, providerId: "codex" },
  {
    id: "working-claude",
    name: "Search index rewrite",
    branch: "feat/search-index",
    providerId: "claude-code",
    todos: { done: 2, total: 5 },
    batches: [
      { msAgo: 190_000, events: [tool("r1", "Read", { file_path: "src/search.ts" })] },
      { msAgo: 4_000, events: [tool("e1", "Edit", { file_path: "src/search.ts" })] },
    ],
  },
  {
    id: "working-codex",
    name: "Release notes",
    branch: "chore/release-notes",
    providerId: "codex",
    batches: [{ msAgo: 42_000, events: [tool("c1", "bash", { command: "bun test" })] }],
  },
  {
    id: "waiting-claude",
    name: "Review the payment flow",
    branch: "fix/payment-review",
    providerId: "claude-code",
    batches: [
      { msAgo: 300_000, events: [tool("p1", "Read", { file_path: "src/pay.ts" })] },
      { msAgo: 299_000, events: [{ type: "tool_result", tool_use_id: "p1", output: "ok" }] },
      { msAgo: 75_000, events: [tool("a1", "Agent", { description: "Check refunds", prompt: "Review" })] },
      { msAgo: 74_000, events: [tool("a2", "Task", { description: "Check retries", prompt: "Review" })] },
      { msAgo: 3_000, events: [tool("g1", "Grep", { pattern: "refund" }, { parentToolUseId: "a1" })] },
    ],
  },
  {
    id: "waiting-codex",
    name: "Split the importer",
    branch: "refactor/importer",
    providerId: "codex",
    batches: [
      { msAgo: 200_000, events: [tool("s1", "collaboration:spawn_agent", { task_name: "worker" }, { agentId: "child-1" })] },
      { msAgo: 30_000, events: [tool("w1", "collaboration:wait")] },
    ],
  },
  {
    id: "stalled",
    name: "Migrate settings",
    branch: "feat/settings-migration",
    providerId: "claude-code",
    attentionKind: "turn-stalled",
    stalledMsAgo: 60_000,
    batches: [{ msAgo: 362_000, events: [tool("m1", "Bash", { command: "bun run build" })] }],
  },
  { id: "busy", name: "New workspace", branch: "feat/new-workspace", providerId: "claude-code", busy: true },
  { id: "idle", name: "Docs touch-ups", branch: "docs/touch-ups", providerId: "codex" },
];

function todoMessage(taskId: string, todos: { done: number; total: number }): ChatMessage {
  const list = Array.from({ length: todos.total }, (_, index) => ({
    content: `Step ${index + 1}`,
    status: index < todos.done ? "completed" : index === todos.done ? "in_progress" : "pending",
  }));
  return {
    id: `${taskId}-todo`,
    role: "assistant",
    model: "preview",
    providerId: "claude-code",
    content: "",
    isStreaming: true,
    parts: [{ type: "tool_use", toolUseId: `${taskId}-todo-call`, toolName: "TodoWrite", input: JSON.stringify({ todos: list }), state: "input-available" }],
  } as ChatMessage;
}

function seed() {
  const now = Date.now();
  const cache: Record<string, unknown> = {};
  const activityByTask: Record<string, ProviderTurnActivitySnapshot | undefined> = {};
  for (const row of ROWS) {
    const taskId = `${row.id}-task`;
    const task = { id: taskId, title: row.name, provider: row.providerId, updatedAt: new Date(now).toISOString(), unread: false, archivedAt: null } as Task;
    const live = Boolean(row.batches);
    let byTask: Record<string, ProviderTurnActivitySnapshot | undefined> = {};
    for (const batch of row.batches ?? []) {
      byTask = applyProviderTurnActivityEvents({
        activityByTask: byTask, taskId, turnId: `${row.id}-turn`, providerId: row.providerId, events: batch.events, now: now - batch.msAgo,
      });
    }
    const activity = byTask[taskId];
    if (activity) {
      activityByTask[taskId] = row.stalledMsAgo == null ? activity : { ...activity, stalledAt: now - row.stalledMsAgo };
    }
    cache[row.id] = {
      tasks: [task],
      messagesByTask: { [taskId]: row.todos ? [todoMessage(taskId, row.todos)] : [] },
      messageCountByTask: {},
      activeTurnIdsByTask: live ? { [taskId]: `${row.id}-turn` } : {},
      openTaskTabIds: [],
    };
  }
  useAppStore.setState((state) => ({
    activeWorkspaceId: "preview-none",
    providerTurnActivityByTask: activityByTask,
    workspaceRuntimeCacheById: cache as typeof state.workspaceRuntimeCacheById,
  }));
}

/**
 * Sidebar workspace rows in every run state, with the real row components:
 * working (Claude, Codex), waiting on helpers (Claude subagents, a Codex wait),
 * stalled, Stave's own busy work and idle. `theme=light|dark|<built-in id>`,
 * `lang=ko`.
 */
export function SidebarRunStatesPreview() {
  useTranslation();
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === params.get("theme")) ?? null;
  const [dark] = useState(() => params.get("theme") !== "light" && (builtinTheme ? builtinTheme.baseMode === "dark" : true));
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    applyAppLocale(params.get("lang") ?? "en");
    seed();
    setReady(true);
  }, []);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
    applyCustomTheme({ theme: builtinTheme });
  }, [dark, builtinTheme]);
  if (!ready) {
    return null;
  }
  return (
    <TooltipProvider>
      <main className={sx(styles.page)}>
        <nav className={sx(styles.sidebar)} aria-label="Workspaces">
          {ROWS.map((row) => (
            <div key={row.id} data-preview-workspace={row.id} className={sx(s.workspaceItem, row.id === "working-claude" && s.workspaceGroupActive)}>
              <div className={sx(s.workspaceRow, s.row, row.id === "working-claude" ? s.workspaceRowActive : s.workspaceRowIdle)}>
                <div className={sx(s.workspaceOpen, s.rowHit)}>
                  <span className={sx(s.workspaceLeadSlot)}>
                    <WorkspaceLeadingStatusIcon
                      workspaceId={row.id}
                      workspaceName={row.name}
                      isDefault={Boolean(row.isDefault)}
                      busy={Boolean(row.busy)}
                      attentionKind={row.attentionKind}
                    />
                  </span>
                  <span className={sx(s.rowIdentity)}>
                    <InlineWorkspaceLabel
                      workspaceId={row.id}
                      workspaceName={row.name}
                      branch={row.branch}
                      isDefault={Boolean(row.isDefault)}
                      isActive={false}
                      compact={false}
                      showBranchContext={false}
                      onRename={async () => ({ ok: true })}
                    />
                    <WorkspaceRowSecondary
                      workspaceId={row.id}
                      workspaceName={row.name}
                      branch={row.branch}
                      isDefault={Boolean(row.isDefault)}
                    />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </nav>
      </main>
    </TooltipProvider>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  sidebar: {
    backgroundColor: "var(--sidebar)",
    borderColor: "var(--sidebar-border)",
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-4"],
    padding: vars["--aui-space-8"],
    width: 300,
  },
});
