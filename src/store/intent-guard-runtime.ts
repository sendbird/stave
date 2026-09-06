import type { StoreApi } from "zustand";
import {
  buildReadOnlyAuxRuntimeOptions,
  resolveAuxLaneRuntime,
} from "@/lib/providers/auxiliary-inference-policy";
import {
  collectIntentContext,
  deriveIntentComplianceStatus,
  normalizePrePrReviewProvider,
  type TurnIntentComplianceResult,
} from "@/lib/source-control-review";
import { buildIntentGuardContextInput } from "@/lib/workspace-information";
import { isAccountUsageBlockingFromState } from "@/store/account-usage-guard";
import type { AppState } from "@/store/app-store.types";

export function createIntentGuardRunner(deps: {
  getState: StoreApi<AppState>["getState"];
  setState: StoreApi<AppState>["setState"];
  turnIdsWithFileEdits: Set<string>;
  retainedByWorkspace: Map<string, TurnIntentComplianceResult>;
}) {
  const restoreIntentCompliance = (args: {
    workspaceId: string;
    taskId?: string;
    turnId?: string;
  }) => {
    const retained = deps.retainedByWorkspace.get(args.workspaceId);
    if (!retained) {
      return;
    }
    const compliance = {
      ...retained,
      taskId: args.taskId,
      turnId: args.turnId,
    };
    deps.retainedByWorkspace.set(args.workspaceId, compliance);
    deps.setState((current) => ({
      turnIntentComplianceByWorkspace: {
        ...current.turnIntentComplianceByWorkspace,
        [args.workspaceId]: compliance,
      },
    }));
  };

  const runIntentGuardForTurn = (args: {
    workspaceId: string;
    taskId?: string;
    turnId?: string;
    workspacePath: string;
  }) => {
    const reviewDiff = window.api?.provider?.reviewDiff;
    if (!reviewDiff) {
      return;
    }
    const state = deps.getState();
    const lane = resolveAuxLaneRuntime({
      lane: "intentGuard",
      policy: state.settings.auxiliaryInferencePolicy,
      legacyProviderId: state.settings.prePrReviewProvider,
    });
    if (
      !lane.enabled ||
      isAccountUsageBlockingFromState({
        providerId: lane.providerId,
        state,
      })
    ) {
      return;
    }
    if (
      lane.config.onlyAfterFileEdits &&
      args.turnId &&
      !deps.turnIdsWithFileEdits.has(args.turnId)
    ) {
      restoreIntentCompliance(args);
      return;
    }
    const info =
      state.activeWorkspaceId === args.workspaceId
        ? state.workspaceInformation
        : state.workspaceRuntimeCacheById[args.workspaceId]
            ?.workspaceInformation;
    if (!info) {
      return;
    }
    const intentContext = collectIntentContext(
      buildIntentGuardContextInput(info),
    );
    if (!intentContext) {
      return;
    }
    const providerId = normalizePrePrReviewProvider(lane.providerId);
    void reviewDiff({
      cwd: args.workspacePath,
      providerId,
      mode: "intent",
      intentContext,
      ...(lane.config.onlyWhenDiffChanged
        ? { intentFingerprintGate: true }
        : {}),
      ...(lane.model
        ? {
            model: lane.model,
            runtimeOptions: buildReadOnlyAuxRuntimeOptions({
              providerId: lane.providerId,
              model: lane.model,
              effortOverrides: lane.effortOverrides,
            }),
          }
        : {}),
    })
      .then((result) => {
        if (!result.ok) {
          return;
        }
        const compliance: TurnIntentComplianceResult = {
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          turnId: args.turnId,
          status: deriveIntentComplianceStatus(result.findings),
          findings: result.findings,
          completedAt: Date.now(),
        };
        deps.retainedByWorkspace.set(args.workspaceId, compliance);
        deps.setState((current) => ({
          turnIntentComplianceByWorkspace: {
            ...current.turnIntentComplianceByWorkspace,
            [args.workspaceId]: compliance,
          },
        }));
      })
      .catch((error) => {
        console.warn("[intent-guard] turn.completed check failed", {
          workspaceId: args.workspaceId,
          error: String(error),
        });
      });
  };

  return { runIntentGuardForTurn };
}
