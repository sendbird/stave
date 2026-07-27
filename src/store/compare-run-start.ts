import {
  buildCompareWorkspaceName,
  type CompareRun,
  type CompareRunVariant,
} from "@/lib/compare-runs";
import { buildModelEffortRuntimeOverrides } from "@/lib/providers/model-effort";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";

type VariantStatus = CompareRunVariant["status"];

interface CandidateWorkspaceSnapshot {
  workspaceId: string;
  taskId: string;
  workspaceName?: string;
  workspacePath?: string;
  branchName?: string;
}

interface CandidateLaunchResult {
  status: string;
  message?: string;
}

export async function launchCompareRunVariants(args: {
  compareRun: Pick<CompareRun, "id" | "variants">;
  seedPrompt: string;
  baseBranch: string;
  updateVariant: (
    variantId: string,
    patch: Partial<CompareRunVariant>,
    expectedStatuses?: readonly VariantStatus[],
  ) => void;
  createWorkspace: (input: {
    name: string;
    mode: "branch";
    fromBranch: string;
    initialTaskTitle: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  readCreatedCandidate: (
    fallbackWorkspaceName: string,
  ) => CandidateWorkspaceSnapshot | null;
  setTaskProvider: (input: { taskId: string; provider: ProviderId }) => void;
  setTaskRuntimeOverrides: (input: {
    taskId: string;
    runtimeOverrides: PromptDraftRuntimeOverrides;
  }) => void;
  sendUserMessage: (input: {
    taskId: string;
    content: string;
  }) => Promise<CandidateLaunchResult>;
}) {
  for (let index = 0; index < args.compareRun.variants.length; index += 1) {
    const variant = args.compareRun.variants[index];
    if (!variant) {
      continue;
    }
    args.updateVariant(variant.id, { status: "creating" }, ["pending"]);
    try {
      const workspaceName = buildCompareWorkspaceName({
        seedPrompt: args.seedPrompt,
        compareRunId: args.compareRun.id,
        index,
      });
      const createResult = await args.createWorkspace({
        name: workspaceName,
        mode: "branch",
        fromBranch: args.baseBranch,
        initialTaskTitle: variant.label?.trim() || `Compare ${index + 1}`,
      });
      if (!createResult.ok) {
        args.updateVariant(
          variant.id,
          {
            status: "failed",
            error: createResult.message?.trim() || "Workspace creation failed.",
          },
          ["creating"],
        );
        continue;
      }

      const candidate = args.readCreatedCandidate(workspaceName);
      if (!candidate) {
        args.updateVariant(
          variant.id,
          {
            status: "failed",
            error: "Workspace creation did not return a candidate task.",
          },
          ["creating"],
        );
        continue;
      }
      args.updateVariant(
        variant.id,
        {
          workspaceId: candidate.workspaceId,
          workspaceName: candidate.workspaceName ?? workspaceName,
          workspacePath: candidate.workspacePath,
          branchName: candidate.branchName,
          taskId: candidate.taskId,
        },
        ["creating"],
      );

      args.setTaskProvider({
        taskId: candidate.taskId,
        provider: variant.provider,
      });
      const model = variant.model?.trim();
      if (model) {
        args.setTaskRuntimeOverrides({
          taskId: candidate.taskId,
          runtimeOverrides: {
            model,
            ...buildModelEffortRuntimeOverrides({
              providerId: variant.provider,
              model,
              effort: variant.effort,
            }),
          },
        });
      }

      const launchResult = await args.sendUserMessage({
        taskId: candidate.taskId,
        content: args.seedPrompt,
      });
      if (launchResult.status !== "started") {
        args.updateVariant(
          variant.id,
          {
            status: "failed",
            error:
              launchResult.status === "steer-unavailable"
                ? launchResult.message || "Candidate steering is unavailable."
                : launchResult.status === "blocked"
                  ? "Candidate launch was blocked."
                  : `Candidate launch returned an unexpected ${launchResult.status} state.`,
          },
          ["creating"],
        );
        continue;
      }

      // A fast provider can finish before sendUserMessage resolves. The
      // expected-status guard makes the terminal outcome win that race.
      args.updateVariant(variant.id, { status: "running", error: undefined }, [
        "creating",
      ]);
    } catch (error) {
      args.updateVariant(
        variant.id,
        {
          status: "failed",
          error:
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : "Candidate launch failed unexpectedly.",
        },
        ["pending", "creating", "running"],
      );
    }
  }
}
