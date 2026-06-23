import { describe, expect, test } from "bun:test";
import {
  buildIntentGuardPrompt,
  collectIntentContext,
  DEFAULT_PRE_PR_REVIEW_PROVIDER,
  deriveIntentComplianceStatus,
  INTENT_GUARD_CONTEXT_MAX_CHARS,
  type PrePrReviewFinding,
  normalizePrePrReviewProvider,
  parseReviewFindings,
} from "../src/lib/source-control-review";

describe("parseReviewFindings", () => {
  test("parses structured findings from a JSON object", () => {
    expect(
      parseReviewFindings(
        JSON.stringify({
          findings: [
            {
              severity: "high",
              file: "src/app.ts",
              line: 42,
              kind: "bug",
              message: "The guard returns before saving the new value.",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        severity: "high",
        file: "src/app.ts",
        line: 42,
        kind: "bug",
        message: "The guard returns before saving the new value.",
      },
    ]);
  });

  test("parses fenced JSON arrays and normalizes aliases", () => {
    expect(
      parseReviewFindings(`\`\`\`json
[
  {
    "severity": "blocker",
    "path": "electron/main.ts",
    "line": "7",
    "kind": "concurrency",
    "description": "Two writes can race and drop the latest snapshot."
  }
]
\`\`\``),
    ).toEqual([
      {
        severity: "critical",
        file: "electron/main.ts",
        line: 7,
        kind: "race",
        message: "Two writes can race and drop the latest snapshot.",
      },
    ]);
  });

  test("returns no findings for malformed or empty responses", () => {
    expect(parseReviewFindings("no issues found")).toEqual([]);
    expect(parseReviewFindings("{ invalid json")).toEqual([]);
    expect(parseReviewFindings('{"findings":[]}')).toEqual([]);
  });

  test("normalizes persisted pre-PR review provider settings", () => {
    expect(normalizePrePrReviewProvider("codex")).toBe("codex");
    expect(normalizePrePrReviewProvider("claude-code")).toBe("claude-code");
    expect(normalizePrePrReviewProvider("unknown")).toBe(
      DEFAULT_PRE_PR_REVIEW_PROVIDER,
    );
  });

  test("normalizes intent-guard finding kinds and their aliases", () => {
    expect(
      parseReviewFindings(
        JSON.stringify({
          findings: [
            {
              severity: "high",
              file: "src/feature.ts",
              kind: "intent",
              message: "Implements a flow the PRD explicitly excludes.",
            },
            {
              severity: "medium",
              file: "src/extra.ts",
              kind: "out-of-scope",
              message: "Adds a setting outside the pinned spec.",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        severity: "high",
        file: "src/feature.ts",
        line: undefined,
        kind: "intent_violation",
        message: "Implements a flow the PRD explicitly excludes.",
      },
      {
        severity: "medium",
        file: "src/extra.ts",
        line: undefined,
        kind: "scope_drift",
        message: "Adds a setting outside the pinned spec.",
      },
    ]);
  });
});

describe("collectIntentContext", () => {
  test("returns an empty string when no intent is pinned", () => {
    expect(collectIntentContext({})).toBe("");
    expect(
      collectIntentContext({ notes: "   ", jiraIssues: [], figmaResources: [] }),
    ).toBe("");
  });

  test("labels notes and resource references with their notes", () => {
    const context = collectIntentContext({
      notes: "Ship a read-only dashboard only.",
      jiraIssues: [
        {
          issueKey: "PROJ-12",
          title: "Dashboard PRD",
          url: "https://jira/PROJ-12",
          note: "No write actions in v1.",
        },
      ],
      confluencePages: [
        { title: "Spec", url: "https://wiki/spec", note: "" },
      ],
      figmaResources: [{ title: "Design", url: "https://figma/abc" }],
    });

    expect(context).toContain("[Notes]\nShip a read-only dashboard only.");
    expect(context).toContain("[Jira] PROJ-12 — Dashboard PRD (https://jira/PROJ-12)");
    expect(context).toContain("note: No write actions in v1.");
    expect(context).toContain("[Confluence] Spec (https://wiki/spec)");
    expect(context).toContain("[Figma] Design (https://figma/abc)");
  });

  test("caps the collected context length", () => {
    const context = collectIntentContext({ notes: "x".repeat(20_000) });
    expect(context.length).toBeLessThanOrEqual(INTENT_GUARD_CONTEXT_MAX_CHARS);
  });
});

describe("deriveIntentComplianceStatus", () => {
  const finding = (
    severity: PrePrReviewFinding["severity"],
  ): PrePrReviewFinding => ({
    severity,
    file: "src/x.ts",
    kind: "intent_violation",
    message: "msg",
  });

  test("passes with no findings", () => {
    expect(deriveIntentComplianceStatus([])).toBe("pass");
  });

  test("fails when any finding is high or critical", () => {
    expect(deriveIntentComplianceStatus([finding("high")])).toBe("fail");
    expect(
      deriveIntentComplianceStatus([finding("low"), finding("critical")]),
    ).toBe("fail");
  });

  test("warns when only low/medium findings exist", () => {
    expect(
      deriveIntentComplianceStatus([finding("low"), finding("medium")]),
    ).toBe("warn");
  });
});

describe("buildIntentGuardPrompt", () => {
  test("embeds the pinned intent and the intent-guard kinds", () => {
    const prompt = buildIntentGuardPrompt({
      diff: "diff --git a/x b/x",
      workingTreeDiff: "",
      fileList: "src/x.ts",
      intentContext: "[Notes]\nRead-only only.",
    });

    expect(prompt).toContain("intent-compliance guard");
    expect(prompt).toContain("intent_violation|scope_drift");
    expect(prompt).toContain("Pinned product intent:");
    expect(prompt).toContain("Read-only only.");
    expect(prompt).toContain("src/x.ts");
    expect(prompt).toContain("Branch diff against the base branch");
  });

  test("falls back when no intent or diff is provided", () => {
    const prompt = buildIntentGuardPrompt({
      diff: "",
      workingTreeDiff: "",
      fileList: "",
      intentContext: "",
    });

    expect(prompt).toContain("(no pinned intent provided)");
    expect(prompt).toContain("(no file list available)");
    expect(prompt).not.toContain("Branch diff against the base branch");
  });
});
