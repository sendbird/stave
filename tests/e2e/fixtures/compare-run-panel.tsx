import { createRoot } from "react-dom/client";
import { applyAppLocale } from "@/i18n";
import { CompareRunPanel } from "@/components/compare/CompareRunPanel";
import { Toaster } from "@/components/ui";
import { StaveDesignProvider } from "@/components/system/StaveDesignProvider";
import type { CompareRun } from "@/lib/compare-runs";
import { applyThemeClass } from "@/lib/themes/apply";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { useAppStore } from "@/store/app.store";
import "@/components/ads/styles.css";
import "@/globals.css";

/**
 * Compare with two candidates in their own workspaces: Claude finished in
 * 18 minutes and reported $1.92; Codex has run for 12 minutes, reported
 * tokens only, and is running a command (`?judged=1` adds the judge's scores,
 * `?kept=1` keeps Claude, `?theme=dark`, `?locale=ko`).
 */
const params = new URLSearchParams(location.search);
applyAppLocale(params.get("locale") === "ko" ? "ko" : "en");
applyThemeClass({ enabled: params.get("theme") === "dark" });
useAppStore.persist.setOptions({ name: "compare-run-panel-fixture" });

const NOW = Date.now();
const MINUTE = 60_000;
const RUN_ID = "compare-fixture";
const judged = params.get("judged") === "1";
const kept = params.get("kept") === "1";

const run: CompareRun = {
  id: RUN_ID,
  seedPrompt: "Fix the billing table overflow on narrow screens without changing the desktop layout.",
  baseWorkspaceId: "ws-main",
  createdAt: new Date(NOW - 20 * MINUTE).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
  status: kept ? "completed" : "running",
  ...(kept ? { keptVariantId: "variant-claude" } : {}),
  ...(judged
    ? {
        judge: {
          provider: "codex",
          status: "completed",
          attempt: 1,
          judgment: {
            recommendedVariantId: "variant-claude",
            rationale: "The scroll container keeps the desktop layout untouched.",
            candidateScores: [
              { variantId: "variant-claude", score: 8.4, summary: "Small and tested.", strengths: [], risks: [], criteria: [] },
              { variantId: "variant-codex", score: 7.1, summary: "Wider change.", strengths: [], risks: [], criteria: [] },
            ],
          },
        },
      }
    : {}),
  variants: [
    {
      id: "variant-claude",
      provider: "claude-code",
      model: "claude-opus-5-5",
      label: "Scroll container",
      status: kept ? "kept" : "completed",
      workspaceId: "ws-claude",
      workspaceName: "compare-billing-a",
      workspacePath: "/tmp/compare-billing-a",
      branchName: "compare/billing-a",
      taskId: "task-claude",
    },
    {
      id: "variant-codex",
      provider: "codex",
      model: "gpt-5.5",
      label: "Responsive columns",
      status: kept ? "discarded" : judged ? "completed" : "running",
      workspaceId: "ws-codex",
      workspaceName: "compare-billing-b",
      workspacePath: "/tmp/compare-billing-b",
      branchName: "compare/billing-b",
      taskId: "task-codex",
    },
  ],
} as CompareRun;

const answer = (args: { id: string; turnId: string; started: number; completed?: number; usage: Record<string, number> }) => ({
  id: args.id,
  role: "assistant",
  model: "model",
  providerId: args.id.includes("codex") ? "codex" : "claude-code",
  content: "Done.",
  turnId: args.turnId,
  startedAt: new Date(args.started).toISOString(),
  ...(args.completed ? { completedAt: new Date(args.completed).toISOString() } : { isStreaming: true }),
  usage: args.usage,
  parts: [{ type: "text", text: "Done." }],
});

const codexRunning = !kept && !judged;
const graph = createWorkGraph({ turnId: "turn-codex", providerId: "codex", startedAt: NOW - 12 * MINUTE });

useAppStore.setState({
  repositoryPath: "/tmp/compare-fixture",
  activeWorkspaceId: "ws-main",
  compareRunsById: { [RUN_ID]: run },
  activeCompareRunId: RUN_ID,
  workspaceRuntimeCacheById: {
    "ws-claude": {
      messagesByTask: {
        "task-claude": [answer({ id: "claude-answer", turnId: "turn-claude", started: NOW - 19 * MINUTE, completed: NOW - MINUTE, usage: { inputTokens: 1200, outputTokens: 4300, totalCostUsd: 1.92 } })],
      },
    },
    "ws-codex": {
      messagesByTask: {
        "task-codex": [answer({ id: "codex-answer", turnId: "turn-codex", started: NOW - 12 * MINUTE, ...(codexRunning ? {} : { completed: NOW - MINUTE }), usage: { inputTokens: 80_000, outputTokens: 8_000 } })],
      },
    },
  },
  providerTurnActivityByTask: codexRunning
    ? {
        "task-codex": {
          turnId: "turn-codex",
          providerId: "codex",
          startedAt: NOW - 12 * MINUTE,
          lastEventAt: NOW,
          stalledAt: null,
          pendingInteraction: null,
          workGraph: graph,
          workItemsById: {
            "tool-1": {
              id: "tool-1", kind: "tool", status: "running", title: "Run command", detail: "bun test tests/billing",
              toolName: "Bash", toolUseId: "tool-1", progressMessages: [], startedAt: NOW - 20_000, updatedAt: NOW, elapsedSeconds: 20,
            },
          },
          orderedWorkItemIds: ["tool-1"],
        },
      }
    : {},
} as never);

(window as unknown as { api?: Record<string, unknown> }).api = {
  sourceControl: {
    getStatus: async ({ cwd }: { cwd: string }) => ({
      ok: true,
      branch: cwd.endsWith("-a") ? "compare/billing-a" : "compare/billing-b",
      items: cwd.endsWith("-a")
        ? [{ code: " M", path: "src/billing/BillingTable.tsx" }, { code: "??", path: "tests/billing-table.test.tsx" }]
        : [{ code: " M", path: "src/billing/BillingTable.tsx" }],
      hasConflicts: false,
      stderr: "",
    }),
  },
};

createRoot(document.getElementById("root")!).render(
  <StaveDesignProvider>
    <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <CompareRunPanel compareRunId={RUN_ID} />
    </main>
    <Toaster />
  </StaveDesignProvider>,
);
