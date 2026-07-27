import { describe, expect, test } from "bun:test";
import {
  buildCompareWorkspaceName,
  buildDefaultCompareVariants,
  buildInitialCompareRun,
  deriveCompareSeedTitle,
  finalizeCompareRunLaunch,
  finishCompareVariantForTask,
  isCompareJudgeReady,
  normalizeCompareJudgeConfig,
  normalizeCompareReviewCriteria,
  normalizePersistedCompareRuns,
  normalizeCompareVariants,
  patchCompareRunVariant,
  parseCompareJudgment,
  resolveCompareTurnOutcome,
} from "../src/lib/compare-runs";

describe("compare run helpers", () => {
  test("builds default Claude and Codex variants from settings models", () => {
    expect(
      buildDefaultCompareVariants({
        modelClaude: "claude-sonnet",
        modelCodex: "gpt-5-codex",
      }),
    ).toEqual([
      {
        provider: "claude-code",
        model: "claude-sonnet",
        label: "Claude",
      },
      {
        provider: "codex",
        model: "gpt-5-codex",
        label: "Codex",
      },
    ]);
  });

  test("normalizes compare variants to supported providers and three entries", () => {
    expect(
      normalizeCompareVariants([
        { provider: "claude-code", model: " claude-sonnet ", label: " A " },
        { provider: "stave", model: "auto", label: "Auto" },
        { provider: "codex", model: " gpt-5-codex ", label: " B " },
        { provider: "claude-code", model: "", label: "" },
        { provider: "codex", model: "extra", label: "Extra" },
      ]),
    ).toEqual([
      {
        provider: "claude-code",
        model: "claude-sonnet",
        label: "A",
      },
      {
        provider: "codex",
        model: "gpt-5-codex",
        label: "B",
      },
      {
        provider: "claude-code",
        model: undefined,
        label: undefined,
      },
    ]);
  });

  test("keeps a supported effort and repairs one the model rejects", () => {
    expect(
      normalizeCompareVariants([
        { provider: "codex", model: "gpt-5.6-sol", effort: "ultra" },
        { provider: "codex", model: "gpt-5.6-luna", effort: "ultra" },
        {
          provider: "claude-code",
          model: "claude-sonnet-5",
          effort: "ultra",
        },
      ]).map((variant) => variant.effort),
    ).toEqual(["ultra", "max", undefined]);

    expect(
      normalizeCompareJudgeConfig({
        provider: "codex",
        model: "gpt-5.6-luna",
        effort: "ultra",
      }),
    ).toEqual({
      provider: "codex",
      model: "gpt-5.6-luna",
      effort: "max",
    });
  });

  test("derives stable run titles and workspace names", () => {
    expect(
      deriveCompareSeedTitle("\n  Implement provider compare runs\n"),
    ).toBe("Implement provider compare runs");
    expect(
      buildCompareWorkspaceName({
        seedPrompt: "Implement provider compare runs!",
        compareRunId: "abcdef123456",
        index: 0,
      }),
    ).toBe("compare/abcdef12/candidate-a/implement-provider-compare-runs");
  });

  test("builds initial run state with pending variants", () => {
    const run = buildInitialCompareRun({
      id: "compare-1",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      baseBranch: "main",
      variants: [
        { provider: "claude-code", label: "Claude" },
        { provider: "codex", label: "Codex" },
      ],
      now: "2026-06-18T00:00:00.000Z",
    });

    expect(run.status).toBe("starting");
    expect(run.variants.map((variant) => variant.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(run.variants.map((variant) => variant.id)).toEqual([
      "compare-1:variant-1",
      "compare-1:variant-2",
    ]);
    expect(run.reviewCriteria).toEqual([
      "Correctness",
      "Tests and verification",
      "Maintainability",
    ]);
    expect(run.judge).toEqual({
      provider: "codex",
      model: undefined,
      status: "pending",
      attempt: 0,
    });
  });

  test("normalizes review criteria and advances completed variants into review", () => {
    expect(
      normalizeCompareReviewCriteria([
        " Correctness ",
        "Correctness",
        "  Tests   pass  ",
        "",
      ]),
    ).toEqual(["Correctness", "Tests pass"]);
    expect(normalizeCompareReviewCriteria([" ", "\n"])).toEqual([
      "Correctness",
      "Tests and verification",
      "Maintainability",
    ]);

    const initial = buildInitialCompareRun({
      id: "compare-2",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      variants: [
        { provider: "claude-code", label: "Claude" },
        { provider: "codex", label: "Codex" },
      ],
      now: "2026-06-18T00:00:00.000Z",
    });
    const running = {
      ...initial,
      status: "running" as const,
      variants: initial.variants.map((variant, index) => ({
        ...variant,
        taskId: `task-${index + 1}`,
        status: "running" as const,
      })),
    };
    const oneDone = finishCompareVariantForTask({
      run: running,
      taskId: "task-1",
      failed: false,
      now: "2026-06-18T00:01:00.000Z",
    });
    expect(oneDone.status).toBe("running");
    expect(oneDone.variants[0]?.status).toBe("completed");

    const reviewReady = finishCompareVariantForTask({
      run: oneDone,
      taskId: "task-2",
      failed: false,
      now: "2026-06-18T00:02:00.000Z",
    });
    expect(reviewReady.status).toBe("completed");
    expect(reviewReady.variants.map((variant) => variant.status)).toEqual([
      "completed",
      "completed",
    ]);
    expect(isCompareJudgeReady(reviewReady)).toBe(true);
  });

  test("patches only compare variants in the expected lifecycle state", () => {
    const run = buildInitialCompareRun({
      id: "compare-patch",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      variants: [{ provider: "codex" }],
      now: "2026-06-18T00:00:00.000Z",
    });
    const runsById = { [run.id]: run };
    const creating = patchCompareRunVariant({
      runsById,
      compareRunId: run.id,
      variantId: run.variants[0]!.id,
      patch: { status: "creating" },
      expectedStatuses: ["pending"],
      now: "2026-06-18T00:01:00.000Z",
    });

    expect(creating).not.toBe(runsById);
    expect(creating[run.id]?.variants[0]?.status).toBe("creating");
    expect(creating[run.id]?.updatedAt).toBe("2026-06-18T00:01:00.000Z");

    const stalePatch = patchCompareRunVariant({
      runsById: creating,
      compareRunId: run.id,
      variantId: run.variants[0]!.id,
      patch: { status: "running" },
      expectedStatuses: ["pending"],
      now: "2026-06-18T00:02:00.000Z",
    });
    expect(stalePatch).toBe(creating);
  });

  test("finalizes compare launch status without losing an existing error", () => {
    const run = buildInitialCompareRun({
      id: "compare-launch",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      variants: [{ provider: "codex" }],
      now: "2026-06-18T00:00:00.000Z",
    });
    const failedRun = {
      ...run,
      variants: run.variants.map((variant) => ({
        ...variant,
        status: "failed" as const,
      })),
    };
    const runsById = { [run.id]: failedRun };
    const finalized = finalizeCompareRunLaunch({
      runsById,
      compareRunId: run.id,
      now: "2026-06-18T00:01:00.000Z",
    });

    expect(finalized[run.id]?.status).toBe("failed");
    expect(finalized[run.id]?.updatedAt).toBe("2026-06-18T00:01:00.000Z");
    expect(finalized[run.id]?.error).toBe(
      "No compare variants could be started.",
    );
    expect(
      finalizeCompareRunLaunch({
        runsById,
        compareRunId: "missing",
        now: "2026-06-18T00:02:00.000Z",
      }),
    ).toBe(runsById);
  });

  test("parses a scored recommendation against the configured rubric", () => {
    const run = buildInitialCompareRun({
      id: "compare-judge",
      seedPrompt: "Choose the safer implementation",
      baseWorkspaceId: "base",
      reviewCriteria: ["Correctness", "Verification"],
      variants: [
        { provider: "claude-code", label: "Candidate A" },
        { provider: "codex", label: "Candidate B" },
      ],
      judge: { provider: "codex", model: "gpt-5.6-sol" },
      now: "2026-06-18T00:00:00.000Z",
    });
    const completed = {
      ...run,
      status: "completed" as const,
      variants: run.variants.map((variant) => ({
        ...variant,
        status: "completed" as const,
      })),
    };
    const judgment = parseCompareJudgment({
      text: `<stave_compare_judgment>
        {
          "recommendedVariantId": "compare-judge:variant-2",
          "confidence": "high",
          "rationale": "Candidate B verifies the edge case.",
          "candidateScores": [
            {
              "variantId": "compare-judge:variant-1",
              "score": 7.2,
              "summary": "Sound but under-tested.",
              "strengths": ["Small diff"],
              "risks": ["No regression test"],
              "criteria": [
                {"criterion": "Correctness", "score": 8, "rationale": "Core path works."},
                {"criterion": "Verification", "score": 6.4, "rationale": "Coverage is incomplete."}
              ]
            },
            {
              "variantId": "compare-judge:variant-2",
              "score": 9.1,
              "summary": "Handles and verifies the edge case.",
              "strengths": ["Regression coverage"],
              "risks": [],
              "criteria": [
                {"criterion": "Correctness", "score": 9.3, "rationale": "Edge case is handled."},
                {"criterion": "Verification", "score": 8.9, "rationale": "Focused tests pass."}
              ]
            }
          ]
        }
      </stave_compare_judgment>`,
      variants: completed.variants,
      reviewCriteria: completed.reviewCriteria ?? [],
    });

    expect(judgment?.recommendedVariantId).toBe("compare-judge:variant-2");
    expect(judgment?.confidence).toBe("high");
    expect(judgment?.candidateScores[1]?.score).toBe(9.1);
    expect(judgment?.candidateScores[1]?.criteria).toEqual([
      {
        criterion: "Correctness",
        score: 9.3,
        rationale: "Edge case is handled.",
      },
      {
        criterion: "Verification",
        score: 8.9,
        rationale: "Focused tests pass.",
      },
    ]);
  });

  test("classifies provider completion, cancellation, and runtime failure", () => {
    expect(
      resolveCompareTurnOutcome([
        { type: "text", text: "Done" },
        { type: "done", stop_reason: "end_turn" },
      ]),
    ).toEqual({ status: "completed" });
    expect(
      resolveCompareTurnOutcome([{ type: "done", stop_reason: "user_abort" }]),
    ).toEqual({
      status: "cancelled",
      error: "The candidate run was cancelled.",
    });
    expect(
      resolveCompareTurnOutcome([{ type: "done", stop_reason: "aborted" }]),
    ).toEqual({
      status: "failed",
      error: "The provider stream ended unexpectedly.",
    });
    expect(
      resolveCompareTurnOutcome([
        {
          type: "error",
          message: "Provider process exited.",
          recoverable: true,
        },
        { type: "done" },
      ]),
    ).toEqual({
      status: "failed",
      error: "Provider process exited.",
    });
    expect(
      resolveCompareTurnOutcome([
        {
          type: "error",
          message: "A tool request could not be rendered.",
          recoverable: true,
        },
        { type: "text", text: "Recovered and finished." },
        { type: "done" },
      ]),
    ).toEqual({ status: "completed" });
  });

  test("does not overwrite a terminal candidate with a later outcome", () => {
    const initial = buildInitialCompareRun({
      id: "compare-terminal",
      seedPrompt: "Ship it",
      baseWorkspaceId: "base",
      variants: [{ provider: "codex" }],
      now: "2026-06-18T00:00:00.000Z",
    });
    const running = {
      ...initial,
      status: "running" as const,
      variants: [
        {
          ...initial.variants[0]!,
          taskId: "task-1",
          status: "running" as const,
        },
      ],
    };
    const completed = finishCompareVariantForTask({
      run: running,
      taskId: "task-1",
      outcome: "completed",
      now: "2026-06-18T00:01:00.000Z",
    });
    const lateFailure = finishCompareVariantForTask({
      run: completed,
      taskId: "task-1",
      outcome: "failed",
      error: "late event",
      now: "2026-06-18T00:02:00.000Z",
    });

    expect(lateFailure).toBe(completed);
    expect(lateFailure.variants[0]?.status).toBe("completed");
  });

  test("normalizes legacy persisted runs and closes interrupted states", () => {
    const normalized = normalizePersistedCompareRuns({
      runsById: {
        legacy: {
          id: "legacy",
          seedPrompt: "Old comparison",
          baseWorkspaceId: "base",
          createdAt: "2026-06-18T00:00:00.000Z",
          updatedAt: "2026-06-18T00:00:00.000Z",
          status: "running",
          variants: [
            {
              id: "legacy:variant-1",
              provider: "codex",
              status: "running",
              taskId: "task-1",
            },
          ],
        },
      },
      now: "2026-06-19T00:00:00.000Z",
    });

    expect(normalized.legacy?.status).toBe("failed");
    expect(normalized.legacy?.variants[0]?.status).toBe("failed");
    expect(normalized.legacy?.reviewCriteria).toEqual([
      "Correctness",
      "Tests and verification",
      "Maintainability",
    ]);
    expect(normalized.legacy?.error).toBe(
      "Comparison was interrupted before it finished.",
    );
  });

  test("marks an interrupted fresh-context judge as failed on restore", () => {
    const run = buildInitialCompareRun({
      id: "judge-interrupted",
      seedPrompt: "Compare",
      baseWorkspaceId: "base",
      variants: [{ provider: "claude-code" }, { provider: "codex" }],
      judge: { provider: "codex", model: "gpt-5.6-sol" },
      now: "2026-06-18T00:00:00.000Z",
    });
    const normalized = normalizePersistedCompareRuns({
      runsById: {
        [run.id]: {
          ...run,
          status: "completed",
          variants: run.variants.map((variant) => ({
            ...variant,
            status: "completed",
          })),
          judge: {
            ...run.judge!,
            status: "running",
            attempt: 1,
          },
        },
      },
      now: "2026-06-19T00:00:00.000Z",
    });

    expect(normalized[run.id]?.judge?.status).toBe("failed");
    expect(normalized[run.id]?.judge?.error).toContain(
      "restarted before the fresh-context judge finished",
    );
  });
});
