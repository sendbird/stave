import { describe, expect, test } from "bun:test";
import {
  getCompareRunStateLabel,
  listCompareRunHistoryEntries,
} from "../src/lib/compare-run-history";
import { buildInitialCompareRun } from "../src/lib/compare-runs";

function buildRun(args: {
  id: string;
  prompt: string;
  createdAt: string;
  status?: "completed" | "failed";
}) {
  const run = buildInitialCompareRun({
    id: args.id,
    seedPrompt: args.prompt,
    baseWorkspaceId: "base",
    variants: [{ provider: "claude-code" }, { provider: "codex" }],
    now: args.createdAt,
  });
  return {
    ...run,
    status: args.status ?? ("completed" as const),
    variants: run.variants.map((variant) => ({
      ...variant,
      status:
        args.status === "failed" ? ("failed" as const) : ("completed" as const),
    })),
    judge:
      args.status === "failed"
        ? { ...run.judge!, status: "failed" as const, attempt: 1 }
        : {
            ...run.judge!,
            status: "completed" as const,
            attempt: 1,
            judgment: {
              recommendedVariantId: run.variants[1]!.id,
              confidence: "high" as const,
              rationale: "Candidate B is safer.",
              candidateScores: [],
            },
          },
  };
}

describe("compare run history", () => {
  test("lists every persisted run newest first and filters by query and status", () => {
    const older = buildRun({
      id: "older",
      prompt: "Investigate legacy settings migration",
      createdAt: "2026-07-20T00:00:00.000Z",
      status: "failed",
    });
    const newer = buildRun({
      id: "newer",
      prompt: "Refine the command palette",
      createdAt: "2026-07-24T00:00:00.000Z",
    });
    const runsById = { older, newer, missing: undefined };

    expect(
      listCompareRunHistoryEntries({ runsById }).map((entry) => entry.id),
    ).toEqual(["newer", "older"]);
    expect(
      listCompareRunHistoryEntries({
        runsById,
        query: "legacy settings",
      }).map((entry) => entry.id),
    ).toEqual(["older"]);
    expect(
      listCompareRunHistoryEntries({ runsById, status: "failed" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["older"]);
  });

  test("uses decision-oriented labels for completed judge states", () => {
    const completed = buildRun({
      id: "review",
      prompt: "Review candidates",
      createdAt: "2026-07-24T00:00:00.000Z",
    });

    expect(getCompareRunStateLabel(completed)).toBe("Ready to review");
    expect(
      listCompareRunHistoryEntries({
        runsById: { [completed.id]: completed },
      })[0]?.judgeLabel,
    ).toBe("Judge recommends Candidate 2");
  });
});
