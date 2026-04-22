import { describe, expect, test } from "bun:test";
import {
  buildPullRequestWorkspaceContext,
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

    expect(context).toContain("Use this workspace context as the primary source of intent");
    expect(context).toContain("Active task: Fix create PR drafting");
    expect(context).toContain("Task request:");
    expect(context).toContain(".stave/context/continued-from-fix-create-pr.md");
    expect(context).toContain("Workspace notes:");
    expect(context).toContain("Open todos:");
    expect(context).toContain("Do not carry over previous workspace or earlier PR summaries");
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
