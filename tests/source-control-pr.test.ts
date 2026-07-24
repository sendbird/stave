import { describe, expect, test } from "bun:test";
import {
  buildPullRequestDescriptionPrompt,
  buildPullRequestWorkspaceContext,
  compactPullRequestDiff,
  generateFallbackPullRequestDraft,
  isReasonablePullRequestTitle,
  mergePullRequestDraft,
  parsePullRequestSuggestionResponse,
  resolvePullRequestComparisonBaseRef,
  resolvePullRequestTitle,
} from "../src/lib/source-control-pr";

describe("generateFallbackPullRequestDraft", () => {
  test("prefers a conventional commit title from the branch history", () => {
    const draft = generateFallbackPullRequestDraft({
      baseBranch: "main",
      headBranch: "fix/jacob/create-pr-slow",
      commitLog: "abc123 fix(topbar): stabilize create pr flow",
      fileList: "M src/components/layout/TopBarOpenPR.tsx\nM electron/main/ipc/scm.ts",
    });

    expect(draft.title).toBe("fix(topbar): stabilize create pr flow");
    expect(draft.body).toContain("## Summary");
    expect(draft.body).toContain("## Changes");
    expect(draft.body).toContain("`src/components/layout/TopBarOpenPR.tsx`");
  });

  test("derives a conventional title from the branch name when no commits exist", () => {
    const draft = generateFallbackPullRequestDraft({
      baseBranch: "main",
      headBranch: "fix/topbar/create-pr-slow",
      fileList: "M src/components/layout/TopBarOpenPR.tsx",
    });

    expect(draft.title).toBe("fix(topbar): create pr slow");
  });

  test("does not invent a scope from the first subject word when the branch has no scope segment", () => {
    const draft = generateFallbackPullRequestDraft({
      baseBranch: "main",
      headBranch: "fix/create-pr-title-and-cache",
      fileList: "M src/components/layout/TopBarOpenPR.tsx",
    });

    expect(draft.title).toBe("fix: create pr title and cache");
  });
});

describe("buildPullRequestWorkspaceContext", () => {
  test("keeps the draft focused on the active workspace task and attached brief", () => {
    const context = buildPullRequestWorkspaceContext({
      activeTaskTitle: "Fix create PR drafting",
      taskPrompt: "Make the first PR draft use the active workspace context instead of older workspace summaries.",
      attachedContextSnippets: [{
        label: ".stave/context/continued-from-fix-create-pr.md",
        content: "# Workspace Continue Brief\n\n## Task Focus\n- Active task: Fix create PR drafting",
      }],
      notes: "Current workspace is only for the create PR drafting regression.",
      openTodos: ["Keep the draft tied to the active workspace", "Commit only current uncommitted files before PR creation"],
    });

    expect(context).toContain("Use this workspace context to understand the intended outcome");
    expect(context).toContain("Git diff and commit log as the source of truth");
    expect(context).toContain("Active task: Fix create PR drafting");
    expect(context).toContain("Task request:");
    expect(context).toContain(".stave/context/continued-from-fix-create-pr.md");
    expect(context).toContain("Workspace notes:");
    expect(context).toContain("Open todos:");
    expect(context).toContain("Do not carry over previous workspace or earlier PR summaries");
  });
});

describe("buildPullRequestDescriptionPrompt", () => {
  test("keeps evidence from every changed file when a long diff is compacted", () => {
    const compacted = compactPullRequestDiff(
      [
        "diff --git a/src/first.ts b/src/first.ts",
        "+++ b/src/first.ts",
        `+${"first behavior ".repeat(40)}`,
        "diff --git a/src/second.ts b/src/second.ts",
        "+++ b/src/second.ts",
        `+${"second behavior ".repeat(40)}`,
      ].join("\n"),
      320,
    );

    expect(compacted.length).toBeLessThanOrEqual(320);
    expect(compacted).toContain("diff --git a/src/first.ts");
    expect(compacted).toContain("diff --git a/src/second.ts");
  });

  test("makes git evidence authoritative and requires concrete change bullets", () => {
    const prompt = buildPullRequestDescriptionPrompt({
      baseTemplate: "TITLE: <title>\nBODY:\n## Summary\n## Changes",
      baseBranch: "main",
      headBranch: "fix/create-pr-summary",
      commitLog: "abc123 fix(pr): summarize actual branch changes",
      fileList: "src/lib/source-control-pr.ts | 20 ++++++++++----------",
      diff: [
        "diff --git a/src/lib/source-control-pr.ts b/src/lib/source-control-pr.ts",
        "+export function buildPullRequestDescriptionPrompt() {}",
      ].join("\n"),
      workingTreeDiff: [
        "diff --git a/tests/source-control-pr.test.ts b/tests/source-control-pr.test.ts",
        '+test("summarizes concrete changes", () => {});',
      ].join("\n"),
      workspaceContext: "Requested: improve every PR even if the implementation is incomplete.",
    });

    expect(prompt).toContain("Git evidence (source of truth for completed work)");
    expect(prompt).toContain("Workspace intent context (use for motivation only");
    expect(prompt).toContain("buildPullRequestDescriptionPrompt");
    expect(prompt).toContain("summarizes concrete changes");
    expect(prompt).toContain("Base every Summary and Changes bullet");
    expect(prompt).toContain("never describe requested-but-unimplemented work as complete");
    expect(prompt).toContain("instead of listing filenames");
  });
});

describe("resolvePullRequestComparisonBaseRef", () => {
  test("prefers the origin tracking branch over a stale local base branch", () => {
    expect(resolvePullRequestComparisonBaseRef({
      baseBranch: "main",
      remoteBranches: ["origin/main", "origin/release"],
    })).toBe("origin/main");
  });

  test("falls back to another matching remote when origin is unavailable", () => {
    expect(resolvePullRequestComparisonBaseRef({
      baseBranch: "release",
      remoteBranches: ["upstream/release", "upstream/main"],
    })).toBe("upstream/release");
  });

  test("keeps an explicit remote ref unchanged", () => {
    expect(resolvePullRequestComparisonBaseRef({
      baseBranch: "origin/main",
      remoteBranches: ["origin/main"],
    })).toBe("origin/main");
  });
});

describe("parsePullRequestSuggestionResponse", () => {
  test("recovers a body when the model omits the BODY marker", () => {
    const parsed = parsePullRequestSuggestionResponse([
      "TITLE: fix(topbar): stabilize create pr flow",
      "## Summary",
      "- Improve the first PR generation attempt",
      "",
      "## Changes",
      "- Use fallback content while the model response is still loading",
    ].join("\n"));

    expect(parsed.title).toBe("fix(topbar): stabilize create pr flow");
    expect(parsed.body).toContain("## Summary");
    expect(parsed.body).toContain("## Changes");
  });
});

describe("mergePullRequestDraft", () => {
  test("keeps the fallback when the generated suggestion is too weak", () => {
    const merged = mergePullRequestDraft({
      fallbackTitle: "fix(topbar): stabilize create pr flow",
      fallbackBody: "## Summary\n- Keep the fallback body.\n\n## Changes\n- Preserve the existing content.",
      generatedTitle: "Pull Request Update",
      generatedBody: "",
    });

    expect(merged).toEqual({
      title: "fix(topbar): stabilize create pr flow",
      body: "## Summary\n- Keep the fallback body.\n\n## Changes\n- Preserve the existing content.",
    });
  });
});

describe("isReasonablePullRequestTitle", () => {
  test("rejects titles with a capitalized subject", () => {
    expect(isReasonablePullRequestTitle("fix(topbar): Stabilize create pr flow")).toBe(false);
    expect(isReasonablePullRequestTitle("fix(topbar): stabilize create pr flow")).toBe(true);
  });
});

describe("resolvePullRequestTitle", () => {
  test("reuses the latest commit type and scope when the generated title diverges", () => {
    const title = resolvePullRequestTitle({
      currentTitle: "feat(ui): add loading splash to create pr dialog",
      commitLog: "abc123 fix(topbar): stabilize create pr flow",
      headBranch: "fix/topbar/create-pr-flow",
    });

    expect(title).toBe("fix(topbar): stabilize create pr flow");
  });

  test("keeps the current title when it already matches the latest commit type and scope", () => {
    const title = resolvePullRequestTitle({
      currentTitle: "fix(topbar): show a loading splash before the draft is ready",
      commitLog: "abc123 fix(topbar): stabilize create pr flow",
    });

    expect(title).toBe("fix(topbar): show a loading splash before the draft is ready");
  });
});
