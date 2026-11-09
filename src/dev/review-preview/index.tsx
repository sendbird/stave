import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { applyAppLocale } from "@/i18n";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { TaskReviewSurface } from "@/components/review/TaskReviewSurface";
import { Toaster } from "@/components/ui";
import { compareFleetAttentionItems, FLEET_ATTENTION_PRIORITY, type FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { EMPTY_FLEET_ATTENTION, useFleetAttentionStore } from "@/store/fleet-attention-store";
import { useSentReviewCommentsStore } from "@/store/sent-review-comments-store";
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
 * `&queue=1` adds two more reviews waiting in Fleet, `&comments=1` adds a
 * second pending comment and two sent ones,
 * `&theme=dark` or `&theme=<built-in theme id>` and `&lang=ko` apply.
 */
const params = new URLSearchParams(window.location.search);
const WORKSPACE_ID = "preview-workspace";
const TASK_ID = "preview-task";
const START = new Date("2026-10-22T09:00:00.000Z");
const STAGE_START = "3f2a9c1d0b8e7f6a5c4d3e2f1a0b9c8d7e6f5a4b";
const HEAD = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d";

/**
 * `&queue=1`: two more tasks wait for review in Fleet, one before this task
 * and one after it, so Next review and J / K have somewhere to go.
 */
const COMMENTS = params.get("comments") === "1";
const PREVIEW_TASKS = [
  { id: TASK_ID, title: "Fix the billing table overflow", turnId: "turn-2", createdAt: "2026-10-22T09:20:00.000Z", summary: "Replaced the fixed minimum width with a scroll container and added a 600px test." },
  ...(params.get("queue") === "1" ? [
    { id: "preview-task-earlier", title: "Tidy the invoice export", turnId: "turn-earlier", createdAt: "2026-10-22T08:40:00.000Z", summary: "Renamed the export columns." },
    { id: "preview-task-later", title: "Audit the settings sidebar", turnId: "turn-later", createdAt: "2026-10-22T09:50:00.000Z", summary: "Listed the sidebar spacing issues." },
  ] : []),
];

const TABLE_BEFORE ="export function BillingTable() {\n  return <table style={{ minWidth: 960 }}>{rows}</table>;\n}\n";
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
  // One saved result per task, written by Mark reviewed and its Undo the way
  // the desktop store writes them (a mark also reads; taking it back keeps the read).
  const results = new Map(PREVIEW_TASKS.map((task) => [task.id, {
    repositoryPath: "/tmp/preview-repo", workspaceId: WORKSPACE_ID, taskId: task.id, turnId: task.turnId, id: `result-${task.id}`,
    repositoryName: "preview-repo", workspaceName: "Preview", taskTitle: task.title, outcome: "completed", summary: task.summary,
    createdAt: task.createdAt, reviewedAt: null as string | null, markedReviewedAt: null as string | null,
  }]));
  const writes: unknown[] = [];
  (window as { __staveResultWrites?: unknown[] }).__staveResultWrites = writes;
  api.persistence = {
    ...(api.persistence as object | undefined),
    listResultReviews: async (args: { taskId?: string; turnId?: string }) => {
      const rows = [...results.values()].filter((row) => (!args.taskId || row.taskId === args.taskId) && (!args.turnId || row.turnId === args.turnId));
      return { ok: true, results: rows.map((row) => ({ ...row })), total: rows.length, hasMore: false };
    },
    setResultMarkedReviewed: async (args: { taskId: string; markedReviewed: boolean }) => {
      writes.push({ kind: "marked", ...args });
      const row = results.get(args.taskId)!;
      const now = new Date().toISOString();
      if (args.markedReviewed) Object.assign(row, { markedReviewedAt: row.markedReviewedAt ?? now, reviewedAt: row.reviewedAt ?? now });
      else row.markedReviewedAt = null;
      return { ok: true, result: { ...row } };
    },
    setResultReviewed: async (args: { taskId: string; reviewed: boolean }) => {
      writes.push({ kind: "read", ...args });
      const row = results.get(args.taskId)!;
      row.reviewedAt = args.reviewed ? (row.reviewedAt ?? new Date().toISOString()) : null;
      return { ok: true, result: { ...row } };
    },
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
  const others = PREVIEW_TASKS.filter((task) => task.id !== TASK_ID);
  useAppStore.setState({
    repositoryPath: "/tmp/preview-repo",
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId: TASK_ID,
    workspacePathById: { [WORKSPACE_ID]: "/tmp/preview-repo" },
    tasks: PREVIEW_TASKS.map((task) => ({ id: task.id, title: task.title, provider: "claude-code", updatedAt: task.createdAt, unread: false })),
    taskWorkspaceIdById: Object.fromEntries(PREVIEW_TASKS.map((task) => [task.id, WORKSPACE_ID])),
    messagesByTask: {
      ...Object.fromEntries(others.map((task) => [task.id, [
        { id: `${task.id}-user`, role: "user", model: "user", providerId: "user", content: task.title, parts: [{ type: "text", text: task.title }] },
        { id: `${task.id}-answer`, role: "assistant", model: "claude", providerId: "claude-code", content: task.summary, turnId: task.turnId, startedAt: task.createdAt, completedAt: task.createdAt, parts: [{ type: "text", text: task.summary }] },
      ]])),
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
    messageCountByTask: Object.fromEntries(PREVIEW_TASKS.map((task) => [task.id, 2])),
    reviewCommentsByTask: { [TASK_ID]: [
      { id: "c1", filePath: "src/billing/BillingTable.tsx", line: 3, side: "modified", body: "Keep the header row sticky while it scrolls.", createdAt: "2026-10-22T09:31:00.000Z" },
      ...(COMMENTS ? [{ id: "c2", filePath: "src/billing/billing-table.test.tsx", line: 2, side: "modified", body: "Also cover 375px so the phone layout is checked.", createdAt: "2026-10-22T09:32:00.000Z" }] : []),
    ] },
  } as never);
  // `&comments=1`: two comments already sent on the table, one whose lines
  // still read as sent and one whose lines the agent changed since.
  useSentReviewCommentsStore.setState({ byTask: COMMENTS ? { [TASK_ID]: [
    {
      comment: { id: "s1", filePath: "src/billing/BillingTable.tsx", line: 4, side: "modified", body: "Use the shared scroll container instead of a new div.", createdAt: "2026-10-22T09:10:00.000Z" },
      sentAt: "2026-10-22T09:12:00.000Z",
      anchor: ["    <div className={styles.scroll}>", "      <table>{rows}</table>", "    </div>"],
    },
    {
      comment: { id: "s2", filePath: "src/billing/BillingTable.tsx", line: 2, side: "modified", body: "Assert the scroll width, not only visibility.", createdAt: "2026-10-22T09:11:00.000Z" },
      sentAt: "2026-10-22T09:12:00.000Z",
      anchor: ["export function BillingTable() {", "  return <table style={{ minWidth: 960 }}>{rows}</table>;", "}"],
    },
  ] } : {} });
  const scope = params.get("scope");
  const chosen: ReviewScope | undefined = scope === "stage" ? { kind: "stage", agentRunId: detail.agentRun.id, stageId: "reproduce", attempt: 1 }
    : scope === "branch" ? { kind: "branch" } : scope === "uncommitted" ? { kind: "uncommitted" } : undefined;
  useTaskReviewModeStore.getState().openReview(TASK_ID, chosen);
  // Fleet's snapshot as its producer would publish it: each task's result
  // waits for review, oldest first.
  const items = PREVIEW_TASKS.map((task): FleetAttentionItem => ({
    id: `result-ready:${task.id}`, kind: "result-ready", priority: FLEET_ATTENTION_PRIORITY["result-ready"], source: "result",
    repositoryPath: "/tmp/preview-repo", repositoryName: "preview-repo", workspaceId: WORKSPACE_ID, workspaceName: "Preview",
    taskId: task.id, taskTitle: task.title, turnId: task.turnId, createdAt: task.createdAt, waitingSince: task.createdAt,
  })).sort(compareFleetAttentionItems);
  useFleetAttentionStore.setState({ snapshot: { ...EMPTY_FLEET_ATTENTION, items, count: items.length, reviewItems: items } });
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
  return <ReviewPreviewSurface />;
}

/** The active task's Review, as the task pane shows it; Next review and J / K change the task. */
function ReviewPreviewSurface() {
  const taskId = useAppStore((state) => state.activeTaskId) || TASK_ID;
  return (
    <main className={sx(styles.page)} data-task-id={taskId}>
      <TaskReviewSurface key={taskId} taskId={taskId} />
      <Toaster />
    </main>
  );
}

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", height: "100vh", backgroundColor: vars["--aui-color-canvas"] },
});
