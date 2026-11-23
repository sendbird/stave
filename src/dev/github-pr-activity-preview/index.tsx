import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useState } from "react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { SourceControlReviewsPanel } from "@/components/layout/SourceControlReviewsPanel";
import { applyAppLocale } from "@/i18n";
import type { GitHubPrActivityRequest } from "@/lib/github-pr-activity";
import type { GitHubPrInboxItem, GitHubPrReviewDetail } from "@/lib/github-pr-review";
import type { PrReviewComment, PrReviewThread } from "@/lib/pr-context";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";

const styles = stylex.create({
  panel: {
    backgroundColor: vars["--aui-color-canvas"],
    blockSize: "100dvh",
    color: vars["--aui-color-text"],
    inlineSize: "100%",
    maxInlineSize: "26rem",
  },
  wide: { maxInlineSize: "46rem" },
});

const cwd = "/tmp/widgets";
const createdAt = "2026-11-20T05:00:00Z";
const url = "https://github.com/example/widgets/pull/42";
const sha = "89abcdef0123456789abcdef0123456789abcdef";
const pr: GitHubPrInboxItem = {
  number: 42, title: "Keep the return path after sign-in", authorLogin: "alex",
  url, repositoryWithOwner: "example/widgets", isDraft: false,
  createdAt, updatedAt: createdAt, commentsCount: 1,
};
const detail: GitHubPrReviewDetail = {
  ...pr, viewerLogin: "alex", body: "Preserve the requested path after a successful sign-in.",
  baseRefName: "main", baseRefOid: sha, headRefName: "login-redirect", headRefOid: sha,
  reviewDecision: "CHANGES_REQUESTED", mergeable: "MERGEABLE", mergeStateStatus: "BLOCKED",
  additions: 12, deletions: 3, changedFiles: 1, files: [], filesTruncated: false, filesError: "",
  timeline: [{
    id: "review", kind: "review", authorLogin: "sam", state: "CHANGES_REQUESTED",
    body: "Please add a test for an expired session.", createdAt, url,
  }],
  checks: [{ name: "Browser tests", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: url }],
};
const task: Task = {
  id: "example-task", title: "Fix the login redirect", provider: "codex", updatedAt: createdAt,
  unread: false, controlMode: "interactive", controlOwner: "stave",
};

async function unavailableTarsOperation(): Promise<never> {
  throw new Error("This preview only stages a Tars draft.");
}

function installFixture(scenario: string | null) {
  let sequence = 0;
  let rerun = false;
  const comments: PrReviewComment[] = [{ id: "initial", author: "alex", body: "Ready for a second look.", createdAt, url }];
  let thread: PrReviewThread = {
    id: "review-thread", path: "src/auth/session/tests/redirect-with-an-expired-session-and-query-parameters.test.ts",
    line: null, originalLine: 38, isResolved: false, isOutdated: true,
    viewerCanReply: true, viewerCanResolve: true, viewerCanUnresolve: false, truncatedComments: 0,
    comments: [{ id: "first", author: "sam", body: "Could this use the session expiry test fixture?", commitSha: sha, createdAt, url }],
  };
  const gitHubPrActivity: GitHubPrActivityRequest = async (args) => {
    if (scenario === "missing-gh" || scenario === "unauthenticated") return { ok: false, reason: scenario };
    if (args.prUrl !== url || args.cwd !== cwd) return { ok: false, reason: "failed" };
    const comment = (body: string) => ({ id: `new-${++sequence}`, author: "alex", body, createdAt, url });
    switch (args.action) {
      case "discussion":
        return { ok: true, kind: "discussion", threads: [thread], omittedThreads: 0, comments: [...comments], omittedComments: 0 };
      case "comment":
        comments.push(comment(args.body));
        return { ok: true, kind: "written" };
      case "reply":
        thread = { ...thread, comments: [...thread.comments, comment(args.body)] };
        return { ok: true, kind: "written" };
      case "resolve":
        thread = { ...thread, isResolved: args.resolved, viewerCanResolve: !args.resolved, viewerCanUnresolve: args.resolved };
        return { ok: true, kind: "written" };
      case "runs":
        return { ok: true, kind: "runs", runs: [{ id: 5317, name: "Browser tests" }], omitted: 0, partial: false };
      case "jobs":
        return {
          ok: true, kind: "jobs", attempt: rerun ? 2 : 1, status: rerun ? "queued" : "completed",
          conclusion: rerun ? "" : "failure", omitted: 0,
          jobs: rerun ? [] : [
            { id: 54, name: "Chromium / Linux", status: "completed", conclusion: "failure", failedSteps: [{ number: 5, name: "Run browser tests" }] },
            { id: 55, name: "Type check", status: "completed", conclusion: "success", failedSteps: [] },
          ],
        };
      case "log":
        return {
          ok: true, kind: "log", truncated: true,
          text: "FAIL redirect-with-expired-session.test.ts\nExpected: /account?returnTo=%2Fsettings\nReceived: /sign-in\n" + "at fixtures/".padEnd(110, "x"),
        };
      case "rerun":
        rerun = true;
        return { ok: true, kind: "written" };
    }
  };
  window.api = {
    ...window.api,
    tars: {
      get: unavailableTarsOperation,
      create: unavailableTarsOperation,
      act: unavailableTarsOperation,
      updateIdentity: unavailableTarsOperation,
      getDraft: async () => null,
      saveDraft: async ({ draft }) => {
        if (draft) sessionStorage.setItem("pr-activity-fix-draft", draft.text);
      },
    },
    sourceControl: {
      getGitHubPrReviewDetail: async () => ({ ok: true, detail, stderr: "" }),
      listGitHubPrs: async () => ({ ok: true, items: [pr], viewerLogin: "alex", stderr: "" }),
      gitHubPrActivity,
      fetchPrContextIndex: async () => ({
        ok: true, stderr: "", index: {
          ref: { owner: "example", repo: "widgets", number: 42, url }, title: pr.title,
          headSha: sha, fetchedAt: createdAt, threads: [thread], truncatedThreads: 0,
          failedChecks: [], truncatedFailedChecks: 0,
        },
      }),
    },
  };
}

export function GitHubPrActivityPreview() {
  const [ready, setReady] = useState(false);
  const params = new URLSearchParams(window.location.search);

  useLayoutEffect(() => {
    const query = new URLSearchParams(window.location.search);
    applyAppLocale(query.get("lang") ?? "en");
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: query.get("theme") === "dark" });
    document.documentElement.dataset.uiDensity = query.get("density") === "compact" ? "compact" : "regular";
    installFixture(query.get("scenario"));
    useAppStore.setState({ tasks: [task], activeTaskId: task.id });
    setReady(true);
  }, []);

  return (
    <main className={sx(styles.panel, params.has("wide") && styles.wide)} data-testid="github-pr-activity-preview">
      {ready ? <SourceControlReviewsPanel cwd={cwd} onOpenDiff={async () => {}} /> : null}
    </main>
  );
}
