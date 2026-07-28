import type { StoreApi } from "zustand";
import {
  buildDefaultCompareVariants,
  buildInitialCompareRun,
  finalizeCompareRunLaunch,
  normalizeCompareReviewCriteria,
  normalizeCompareVariants,
  patchCompareRunVariant,
  type CompareRunVariant,
} from "@/lib/compare-runs";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";
import type { AppState } from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { cancelCompareJudgeSecondaryRun } from "@/store/compare-run-judge";
import { launchCompareRunVariants } from "@/store/compare-run-start";
import type { PromptDraft } from "@/types/chat";

type CompareActionKey =
  | "openCompareRun"
  | "startCompareRunFromActiveDraft"
  | "startCompareRun"
  | "openCompareVariant"
  | "keepCompareVariant"
  | "cancelCompareRun";

type CompareActions = Pick<AppState, CompareActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createCompareActions(args: {
  set: StoreSet;
  get: StoreGet;
  emptyPromptDraft: PromptDraft;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
}): CompareActions {
  const {
    set,
    get,
    emptyPromptDraft: EMPTY_PROMPT_DRAFT,
    incrementWorkspaceSnapshotVersion,
  } = args;

  return {
    openCompareRun: ({ compareRunId }) => {
      const normalizedCompareRunId = compareRunId.trim();
      if (!normalizedCompareRunId) {
        return;
      }
      set((state) => {
        if (!state.compareRunsById[normalizedCompareRunId]) {
          return state;
        }
        return {
          activeCompareRunId: normalizedCompareRunId,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface: {
            kind: "compare-run",
            compareRunId: normalizedCompareRunId,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    startCompareRunFromActiveDraft: async () => {
      const state = get();
      const activeDraft =
        state.promptDraftByTask[state.activeTaskId] ??
        state.promptDraftByTask["draft:session"] ??
        EMPTY_PROMPT_DRAFT;
      const seedPrompt = activeDraft.text.trim();
      if (!seedPrompt) {
        return {
          ok: false,
          message: "Write a prompt before starting a compare run.",
        };
      }
      return get().startCompareRun({ seedPrompt });
    },
    startCompareRun: async ({
      seedPrompt,
      variants,
      judge,
      reviewCriteria,
    }) => {
      const normalizedSeedPrompt = seedPrompt.trim();
      if (!normalizedSeedPrompt) {
        return {
          ok: false,
          message: "Compare run prompt is required.",
        };
      }

      const stateBefore = get();
      if (!stateBefore.projectPath || !stateBefore.activeWorkspaceId) {
        return {
          ok: false,
          message: "Open a project before starting a compare run.",
        };
      }

      const normalizedVariants = normalizeCompareVariants(
        variants ??
          buildDefaultCompareVariants({
            modelClaude: stateBefore.settings.modelClaude,
            modelCodex: stateBefore.settings.modelCodex,
          }),
      );
      if (normalizedVariants.length < 2) {
        return {
          ok: false,
          message: "Compare runs need at least two variants.",
        };
      }

      const compareRunId = crypto.randomUUID();
      const now = buildRecentTimestamp();
      const baseWorkspaceId = stateBefore.activeWorkspaceId;
      const baseBranch =
        stateBefore.workspaceBranchById[baseWorkspaceId] ??
        stateBefore.defaultBranch ??
        "main";
      const compareRun = buildInitialCompareRun({
        id: compareRunId,
        seedPrompt: normalizedSeedPrompt,
        baseWorkspaceId,
        baseTaskId: stateBefore.activeTaskId ?? undefined,
        baseBranch,
        variants: normalizedVariants,
        reviewCriteria: normalizeCompareReviewCriteria(reviewCriteria),
        judge,
        now,
      });

      set((state) => ({
        compareRunsById: {
          ...state.compareRunsById,
          [compareRunId]: compareRun,
        },
        activeCompareRunId: compareRunId,
      }));

      const updateVariant = (
        variantId: string,
        patch: Partial<CompareRunVariant>,
        expectedStatuses?: readonly CompareRunVariant["status"][],
      ) => {
        set((state) => {
          const compareRunsById = patchCompareRunVariant({
            runsById: state.compareRunsById,
            compareRunId,
            variantId,
            patch,
            expectedStatuses,
            now: buildRecentTimestamp(),
          });
          return compareRunsById === state.compareRunsById
            ? state
            : { compareRunsById };
        });
      };
      await launchCompareRunVariants({
        compareRun,
        seedPrompt: normalizedSeedPrompt,
        baseBranch,
        updateVariant,
        createWorkspace: (input) => get().createWorkspace(input),
        readCreatedCandidate: (fallbackWorkspaceName) => {
          const state = get();
          const workspaceId = state.activeWorkspaceId;
          const taskId = state.activeTaskId;
          return workspaceId && taskId
            ? {
                workspaceId,
                taskId,
                workspaceName:
                  state.workspaces.find(
                    (workspace) => workspace.id === workspaceId,
                  )?.name ?? fallbackWorkspaceName,
                workspacePath: state.workspacePathById[workspaceId],
                branchName: state.workspaceBranchById[workspaceId],
              }
            : null;
        },
        setTaskProvider: (input) => get().setTaskProvider(input),
        setTaskRuntimeOverrides: ({ taskId, runtimeOverrides }) =>
          get().updatePromptDraft({ taskId, patch: { runtimeOverrides } }),
        sendUserMessage: (input) => get().sendUserMessage(input),
      });

      set((state) => {
        const compareRunsById = finalizeCompareRunLaunch({
          runsById: state.compareRunsById,
          compareRunId,
          now: buildRecentTimestamp(),
        });
        if (compareRunsById === state.compareRunsById) {
          return state;
        }
        return {
          compareRunsById,
          activeCompareRunId: compareRunId,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          activeSurface: {
            kind: "compare-run",
            compareRunId,
          },
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });

      const finalRun = get().compareRunsById[compareRunId];
      if (finalRun?.status === "failed" || finalRun?.status === "cancelled") {
        return {
          ok: false,
          compareRunId,
          message: finalRun.error || "No compare variants could be started.",
        };
      }
      return { ok: true, compareRunId };
    },
    openCompareVariant: async ({ compareRunId, variantId }) => {
      const run = get().compareRunsById[compareRunId];
      const variant = run?.variants.find((item) => item.id === variantId);
      if (!variant?.workspaceId || !variant.taskId) {
        return;
      }
      const stateBeforeOpen = get();
      if (stateBeforeOpen.activeWorkspaceId !== variant.workspaceId) {
        await stateBeforeOpen.switchWorkspace({
          workspaceId: variant.workspaceId,
        });
      }
      get().selectTask({ taskId: variant.taskId });
    },
    keepCompareVariant: async ({ compareRunId, variantId }) => {
      const run = get().compareRunsById[compareRunId];
      const keptVariant = run?.variants.find(
        (variant) => variant.id === variantId,
      );
      if (!run || !keptVariant?.workspaceId || !keptVariant.taskId) {
        return {
          ok: false,
          message: "Compare variant is no longer available.",
        };
      }
      if (keptVariant.status !== "completed") {
        return {
          ok: false,
          message: "Wait until this candidate finishes before keeping it.",
        };
      }
      if (run.judge?.status === "pending" || run.judge?.status === "running") {
        return {
          ok: false,
          message: "Wait for the independent judge before keeping a result.",
        };
      }

      const discardWorkspaceIds = run.variants
        .filter(
          (variant) =>
            variant.id !== variantId &&
            variant.workspaceId &&
            variant.status !== "discarded",
        )
        .map((variant) => variant.workspaceId!);

      for (const workspaceId of discardWorkspaceIds) {
        await get().closeWorkspace({ workspaceId });
      }

      await get().openCompareVariant({ compareRunId, variantId });

      set((state) => {
        const currentRun = state.compareRunsById[compareRunId];
        if (!currentRun) {
          return state;
        }
        return {
          compareRunsById: {
            ...state.compareRunsById,
            [compareRunId]: {
              ...currentRun,
              status: "completed",
              keptVariantId: variantId,
              updatedAt: buildRecentTimestamp(),
              variants: currentRun.variants.map((variant) => {
                if (variant.id === variantId) {
                  return { ...variant, status: "kept" };
                }
                if (variant.workspaceId) {
                  return { ...variant, status: "discarded" };
                }
                return variant;
              }),
            },
          },
        };
      });

      return { ok: true, compareRunId };
    },
    cancelCompareRun: async ({ compareRunId }) => {
      const run = get().compareRunsById[compareRunId];
      if (!run) {
        return { ok: false, message: "Compare run was not found." };
      }
      if (run.keptVariantId) {
        return {
          ok: false,
          message: "The kept candidate is no longer part of this run.",
        };
      }
      if (run.status === "cancelled") {
        return { ok: true, compareRunId };
      }

      set((state) => {
        const currentRun = state.compareRunsById[compareRunId];
        if (!currentRun) {
          return state;
        }
        return {
          compareRunsById: {
            ...state.compareRunsById,
            [compareRunId]: {
              ...currentRun,
              status: "cancelled",
              updatedAt: buildRecentTimestamp(),
              variants: currentRun.variants.map((variant) => ({
                ...variant,
                status: variant.status === "kept" ? "kept" : "discarded",
              })),
            },
          },
        };
      });

      await cancelCompareJudgeSecondaryRun({ run });

      for (const variant of run.variants) {
        if (variant.workspaceId && variant.status !== "discarded") {
          await get().closeWorkspace({ workspaceId: variant.workspaceId });
        }
      }

      return { ok: true, compareRunId };
    },
  };
}
