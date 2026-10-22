import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { TaskReviewSurface } from "@/components/review/TaskReviewSurface";
import { TaskSurfaceModeBar } from "@/components/review/TaskSurfaceModeBar";
import { buildAgentRunFixtures } from "@/dev/agent-run-preview/agent-run-fixtures";
import type { ReviewScope } from "@/lib/review/review-scope";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * Review mode on the dev preview (`?stavePreview=review`): a task with an
 * agent run waiting for sign-off after its Reproduce stage.
 * `&scope=turn|stage|branch|uncommitted` opens that scope (default: turn),
 * `&diff=error|empty` makes the change read fail or come back empty,
 * `&theme=dark` or `&theme=<built-in theme id>` and `&lang=ko` apply.
 */
const params = new URLSearchParams(window.location.search);
const WORKSPACE_ID = "preview-workspace";
const TASK_ID = "preview-task";
const START = new Date("2026-10-22T09:00:00.000Z");
const STAGE_START = "3f2a9c1d0b8e7f6a5c4d3e2f1a0b9c8d7e6f5a4b";
const HEAD = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";

const TABLE_BEFORE = "export function BillingTable() {\n  return <table style={{ minWidth: 960 }}>{rows}</table>;\n}\n";
const TABLE_AFTER = "export function BillingTable() {\n  return (\n    <div className={styles.scroll}>\n      <table>{rows}</table>\n    </div>\n  );\n}\n";
const TEST_AFTER = "test(\"the table scrolls at 600px\", () => {\n  render(<BillingTable />, { width: 600 });\n  expect(screen.getByRole(\"table\")).toBeVisible();\n});\n";

function installBridgeStubs() {
  const api = ((window as { api?: Record<string, unknown> }).api ??= {});
  const failure = params.get("diff");
  api.sourceControl = {
    ...(api.sourceControl as object | undefined),
    getReviewDiff: async (args: { base: { kind: string } }) => {
      if (failure === "error") return { ok: false, baseSha: null, baseRef: null, headSha: HEAD, files: [], stderr: "fatal: bad object 3f2a9c1" };
      const files = failure === "empty" ? [] : [
        { path: "src/billing/BillingTable.tsx", status: "M", additions: 5, deletions: 1 },
        { path: "src/billing/billing-table.test.tsx", status: "A", additions: 4, deletions: 0, untracked: true },
        ...(args.base.kind === "head" ? [] : [{ path: "README.md", status: "M", additions: 2, deletions: 0 }]),
      ];
      return { ok: true, baseSha: args.base.kind === "head" ? HEAD : STAGE_START, baseRef: args.base.kind === "merge-base" ? "origin/main" : null, headSha: HEAD, files, stderr: "" };
    },
    getReviewFileDiff: async (args: { path: string }) => ({
      ok: true,
      oldContent: args.path.endsWith("BillingTable.tsx") ? TABLE_BEFORE : args.path === "README.md" ? "# Billing\n" : "",
      newContent: args.path.endsWith("BillingTable.tsx") ? TABLE_AFTER : args.path === "README.md" ? "# Billing\n\nThe table scrolls on narrow screens.\n" : TEST_AFTER,
      stderr: "",
    }),
  };
  api.persistence = {
    ...(api.persistence as object | undefined),
    listResultReviews: async () => ({
      ok: true,
      results: [{ repositoryPath: "/tmp/preview-repo", workspaceId: WORKSPACE_ID, taskId: TASK_ID, turnId: "turn-2", id: "result-1", taskTitle: "Fix the billing table overflow", outcome: "completed", summary: "Replaced the fixed minimum width with a scroll container and added a 600px test.", createdAt: "2026-10-22T09:20:00.000Z", reviewedAt: null }],
      total: 1,
      hasMore: false,
    }),
    setResultMarkedReviewed: async (args: Record<string, unknown>) => ({
      ok: true,
      result: { ...args, id: "result-1", repositoryName: "preview-repo", workspaceName: "Preview", taskTitle: "Fix the billing table overflow", outcome: "completed", summary: "Done.", createdAt: "2026-10-22T09:20:00.000Z", reviewedAt: "2026-10-22T09:21:00.000Z", markedReviewedAt: new Date().toISOString() },
    }),
  };
  api.lens = {
    ...(api.lens as object | undefined),
    listReviewRecords: async () => ({ ok: true, records: [{
      id: "record-1", taskId: TASK_ID, workspaceId: WORKSPACE_ID, lensSessionId: "lens-1", annotationId: "annotation-1",
      pageUrl: "http://localhost:5173/billing", viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
      before: { imageId: "lens-comment-image:preview-workspace:lens-1:annotation-1" }, afterImagePath: "lens-reviews/x/record-1.png",
      documentId: "document-1", verdict: "needs-recheck", recheckReason: "page-changed",
      confirmedAt: "2026-10-22T09:25:00.000Z", capturedAt: "2026-10-22T09:24:00.000Z", updatedAt: "2026-10-22T09:30:00.000Z",
    }] }),
    readReviewRecordImage: async () => ({ ok: false, code: "not-found" }),
  };
}

function seed() {
  const fixtures = buildAgentRunFixtures(START);
  const detail = structuredClone(fixtures.signOff);
  const reproduce = detail.stages.find((record) => record.stageId === "reproduce");
  if (reproduce) {
    reproduce.startHeadSha = STAGE_START;
    reproduce.facts = { ...reproduce.facts!, changedPaths: ["src/billing/BillingTable.tsx", "src/billing/billing-table.test.tsx"] };
  }
  useAgentRunsStore.setState({
    workspaceId: WORKSPACE_ID,
    loadedWorkspaceId: WORKSPACE_ID,
    details: { [detail.agentRun.id]: detail },
    agentRunIdByTask: { [agentRunTaskKey(WORKSPACE_ID, TASK_ID)]: detail.agentRun.id },
    agentRunIdsByTask: { [agentRunTaskKey(WORKSPACE_ID, TASK_ID)]: [detail.agentRun.id] },
  } as never);
  useAppStore.setState({
    repositoryPath: "/tmp/preview-repo",
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId: TASK_ID,
    workspacePathById: { [WORKSPACE_ID]: "/tmp/preview-repo" },
    tasks: [{ id: TASK_ID, title: "Fix the billing table overflow", provider: "claude-code", updatedAt: "2026-10-22T09:20:00.000Z", unread: false }],
    messagesByTask: {
      [TASK_ID]: [
        { id: "m1", role: "user", model: "user", providerId: "user", content: "Fix the billing table overflow on narrow screens.", parts: [{ type: "text", text: "Fix the billing table overflow on narrow screens." }] },
        { id: "m2", role: "assistant", model: "claude", providerId: "claude-code", content: "Done.", turnId: "turn-2", startedAt: "2026-10-22T09:01:00.000Z", parts: [
          { type: "code_diff", filePath: "src/billing/BillingTable.tsx", oldContent: TABLE_BEFORE, newContent: TABLE_AFTER, status: "accepted" },
          { type: "code_diff", filePath: "src/billing/billing-table.test.tsx", oldContent: "", newContent: TEST_AFTER, status: "accepted" },
          // The approval record: one you answered, two decided automatically, one denied when nobody answered.
          { type: "approval", toolName: "Edit", description: "", input: "src/billing/BillingTable.tsx", requestId: "a1", state: "approval-responded", prompted: false, resolution: { decision: "allowed", source: "provider-auto", reason: "permission-mode", decidedAt: "2026-10-22T09:02:10.000Z" } },
          { type: "approval", toolName: "Bash", description: "Run the billing tests", input: "bun test src/billing", requestId: "a2", state: "approval-responded", resolution: { decision: "allowed", source: "user", scope: "once", decidedAt: "2026-10-22T09:03:05.000Z" } },
          { type: "approval", toolName: "Bash", description: "", input: "bun run lint", requestId: "a3", state: "approval-responded", prompted: false, resolution: { decision: "allowed", source: "rule", reason: "autonomy", decidedAt: "2026-10-22T09:03:40.000Z" } },
          { type: "approval", toolName: "Bash", description: "Publish the preview", input: "git push origin main", requestId: "a4", state: "output-denied", resolution: { decision: "denied", source: "rule", reason: "timeout", decidedAt: "2026-10-22T09:48:40.000Z" } },
          { type: "text", text: "Replaced the fixed minimum width with a scroll container." },
        ] },
      ],
    },
    messageCountByTask: { [TASK_ID]: 2 },
    reviewCommentsByTask: { [TASK_ID]: [{ id: "c1", filePath: "src/billing/BillingTable.tsx", line: 3, side: "modified", body: "Keep the header row sticky while it scrolls.", createdAt: "2026-10-22T09:31:00.000Z" }] },
  } as never);
  const scope = params.get("scope");
  const chosen: ReviewScope | undefined = scope === "stage" ? { kind: "stage", agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 }
    : scope === "branch" ? { kind: "branch" } : scope === "uncommitted" ? { kind: "uncommitted" } : undefined;
  useTaskReviewModeStore.getState().openReview(TASK_ID, chosen);
}

export function ReviewPreview() {
  const theme = params.get("theme");
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === theme) ?? null;
  const [seeded, setSeeded] = useState(false);
  useLayoutEffect(() => {
    applyThemeClass({ enabled: theme === "dark" || builtinTheme?.baseMode === "dark" });
    applyCustomTheme({ theme: builtinTheme });
    applyAppLocale(params.get("lang") ?? "en");
    installBridgeStubs();
    seed();
    setSeeded(true);
  }, [theme, builtinTheme]);
  if (!seeded) return null;
  return (
    <main className={sx(styles.page)}>
      <TaskSurfaceModeBar taskId={TASK_ID} mode="review" />
      <TaskReviewSurface taskId={TASK_ID} />
    </main>
  );
}

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", height: "100vh", backgroundColor: vars["--ads-color-canvas"] },
});
