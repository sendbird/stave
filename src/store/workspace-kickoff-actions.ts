import {
  inferProviderIdFromModel,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import { DEFAULT_PROMPT_WORKSPACE_KICKOFF } from "@/lib/providers/prompt-defaults";
import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import {
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
  buildDeterministicKickoffProposal,
  buildKickoffResolutionPrompt,
  buildWorkspaceInformationSeed,
  classifyKickoffSource,
  normalizeKickoffSourceConfigs,
  parseKickoffProposalResponse,
  type KickoffProposalDraft,
  type KickoffSourceConfig,
} from "@/lib/workspace-kickoff";
// Imported from `app-settings` rather than `app.store` so this module has no
// edge back into the store: `app-settings` depends on this file for the kickoff
// settings defaults.
import type { AppSettings } from "@/store/app-settings";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";
import {
  resolveProjectBasePrompt,
  resolveProjectKickoffBranchNamingRule,
  type RecentProjectState,
} from "@/store/project.utils";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";

export interface WorkspaceKickoffSettings {
  kickoffSourceConfigs: KickoffSourceConfig[];
  kickoffPrimaryModel: string;
  kickoffFallbackModel: string;
  kickoffPrompt: string;
}

export const DEFAULT_WORKSPACE_KICKOFF_SETTINGS: WorkspaceKickoffSettings = {
  kickoffSourceConfigs: normalizeKickoffSourceConfigs(
    DEFAULT_KICKOFF_SOURCE_CONFIGS,
  ),
  kickoffPrimaryModel: "gpt-5.6-luna",
  kickoffFallbackModel: "claude-haiku-4-5",
  kickoffPrompt: DEFAULT_PROMPT_WORKSPACE_KICKOFF,
};

export interface ResolveKickoffProposalResult {
  ok: boolean;
  proposal?: KickoffProposalDraft;
  message?: string;
}

export interface KickoffWorkspaceArgs {
  proposal: KickoffProposalDraft;
  fromBranch?: string;
  fromBranchKind?: "local" | "remote";
  startFirstTask: boolean;
  firstTaskProvider?: ProviderId;
  firstTaskRuntimeOverrides?: PromptDraftRuntimeOverrides;
  extraInstructions?: string;
}

export interface KickoffWorkspaceResult {
  ok: boolean;
  message?: string;
  noticeLevel?: "success" | "warning";
}

export interface WorkspaceKickoffActions {
  resolveKickoffProposal: (args: {
    input: string;
  }) => Promise<ResolveKickoffProposalResult>;
  cancelKickoffResolution: () => void;
  kickoffWorkspace: (
    args: KickoffWorkspaceArgs,
  ) => Promise<KickoffWorkspaceResult>;
}

type KickoffResolverState = {
  projectPath: string | null;
  recentProjects: RecentProjectState[];
  settings: AppSettings;
};

function hasAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value && typeof value === "object" && Symbol.asyncIterator in value,
  );
}

async function collectProviderEvents(
  value: unknown,
): Promise<NormalizedProviderEvent[]> {
  const resolved = await value;
  if (Array.isArray(resolved)) {
    return resolved as NormalizedProviderEvent[];
  }
  if (!hasAsyncIterable(resolved)) {
    return [];
  }
  const events: NormalizedProviderEvent[] = [];
  for await (const item of resolved) {
    events.push(item as NormalizedProviderEvent);
  }
  return events;
}

export function createWorkspaceKickoffResolver(args: {
  getState: () => KickoffResolverState;
}) {
  let activeResolution: {
    requestId: string;
    turnId: string | null;
  } | null = null;

  const cancel = () => {
    const resolution = activeResolution;
    activeResolution = null;
    if (resolution?.turnId) {
      void window.api?.provider?.abortTurn?.({ turnId: resolution.turnId });
    }
  };

  const resolve = async ({
    input,
  }: {
    input: string;
  }): Promise<ResolveKickoffProposalResult> => {
    const state = args.getState();
    const normalizedInput = input.trim();
    if (!normalizedInput) {
      return { ok: false, message: "A kickoff source is required." };
    }
    if (!state.projectPath) {
      return {
        ok: false,
        message: "Open a project before resolving a kickoff source.",
      };
    }

    const settings = state.settings;
    const classification = classifyKickoffSource({
      input: normalizedInput,
      configs: settings.kickoffSourceConfigs,
    });
    const deterministicProposal = () =>
      buildDeterministicKickoffProposal({ classification });
    if (!settings.kickoffPrompt.trim()) {
      return { ok: true, proposal: deterministicProposal() };
    }

    const primaryModel = normalizeModelSelection({
      value: settings.kickoffPrimaryModel,
      fallback: DEFAULT_WORKSPACE_KICKOFF_SETTINGS.kickoffPrimaryModel,
    });
    const fallbackModel = normalizeModelSelection({
      value: settings.kickoffFallbackModel,
      fallback: DEFAULT_WORKSPACE_KICKOFF_SETTINGS.kickoffFallbackModel,
    });
    const candidateModels = [
      ...new Set([primaryModel.trim(), fallbackModel.trim()].filter(Boolean)),
    ];
    if (candidateModels.length === 0) {
      return { ok: true, proposal: deterministicProposal() };
    }

    const prompt = buildKickoffResolutionPrompt({
      instructionPrompt: settings.kickoffPrompt,
      classification,
      branchNamingRule: resolveProjectKickoffBranchNamingRule({
        projectPath: state.projectPath,
        recentProjects: state.recentProjects,
      }),
      projectBasePrompt: resolveProjectBasePrompt({
        projectPath: state.projectPath,
        recentProjects: state.recentProjects,
      }),
    });
    const requestId = crypto.randomUUID();
    activeResolution = { requestId, turnId: null };

    try {
      for (const model of candidateModels) {
        if (activeResolution?.requestId !== requestId) {
          return { ok: false, message: "Kickoff resolution was cancelled." };
        }

        const providerId = inferProviderIdFromModel({ model });
        const mcpServers = classification.config?.mcpServers ?? [];
        const runtimeOptions = {
          ...buildProviderRuntimeOptions({
            provider: providerId,
            model,
            settings,
          }),
          chatStreamingEnabled: false,
          responseStylePrompt: undefined,
          promptPrDescription: undefined,
          promptInlineCompletion: undefined,
          ...(providerId === "claude-code"
            ? {
                claudeAllowedTools: mcpServers.map(
                  (server) => `mcp__${server}`,
                ),
                claudeMaxTurns: mcpServers.length > 0 ? 8 : 1,
                claudePermissionMode: "dontAsk" as const,
                claudeAgentProgressSummaries: false,
                claudeFastMode: true,
              }
            : providerId === "codex"
              ? {
                  codexApprovalPolicy: "never" as const,
                  codexFileAccess: "read-only" as const,
                  codexNetworkAccess: false,
                  codexWebSearch: "disabled" as const,
                  codexReasoningSummary: "none" as const,
                  codexShowRawReasoning: false,
                  codexPlanMode: false,
                  codexFastMode: true,
                }
              : {}),
        };

        if (window.api?.provider?.checkAvailability) {
          try {
            const availability = await window.api.provider.checkAvailability({
              providerId,
              runtimeOptions,
            });
            if (!availability.ok || !availability.available) {
              continue;
            }
          } catch {
            continue;
          }
        }

        if (activeResolution?.requestId !== requestId) {
          return { ok: false, message: "Kickoff resolution was cancelled." };
        }

        try {
          const streamTurn = window.api?.provider?.streamTurn;
          if (!streamTurn) {
            break;
          }
          const turnId = crypto.randomUUID();
          activeResolution = { requestId, turnId };
          const events = await collectProviderEvents(
            streamTurn({
              turnId,
              providerId,
              prompt,
              cwd: state.projectPath,
              runtimeOptions,
            }),
          );
          if (activeResolution?.requestId !== requestId) {
            return {
              ok: false,
              message: "Kickoff resolution was cancelled.",
            };
          }
          const responseText = events
            .filter(
              (
                event,
              ): event is Extract<NormalizedProviderEvent, { type: "text" }> =>
                event.type === "text",
            )
            .map((event) => event.text)
            .join("")
            .trim();
          const proposal = responseText
            ? parseKickoffProposalResponse({
                value: responseText,
                classification,
                model,
              })
            : null;
          if (proposal) {
            return { ok: true, proposal };
          }
        } catch {
          continue;
        }
      }

      return activeResolution?.requestId === requestId
        ? { ok: true, proposal: deterministicProposal() }
        : { ok: false, message: "Kickoff resolution was cancelled." };
    } finally {
      if (activeResolution?.requestId === requestId) {
        activeResolution = null;
      }
    }
  };

  return { resolve, cancel };
}

type KickoffWorkspaceState = {
  activeTaskId: string | null;
  createWorkspace: (args: {
    name: string;
    label?: string;
    mode: "branch";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
    initialTaskTitle?: string;
    workspaceInformation?: WorkspaceInformationState;
  }) => Promise<KickoffWorkspaceResult>;
  setTaskProvider: (args: { taskId: string; provider: ProviderId }) => void;
  updatePromptDraft: (args: {
    taskId: string;
    patch: {
      text: string;
      runtimeOverrides?: PromptDraftRuntimeOverrides;
    };
  }) => void;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    providerOverride?: ProviderId;
    runtimeOverrides?: PromptDraftRuntimeOverrides;
  }) => Promise<{ status: string }>;
};

export async function runWorkspaceKickoff(args: {
  input: KickoffWorkspaceArgs;
  getState: () => KickoffWorkspaceState;
}): Promise<KickoffWorkspaceResult> {
  const { proposal } = args.input;
  const createResult = await args.getState().createWorkspace({
    name: proposal.branchName,
    label: proposal.workspaceLabel,
    mode: "branch",
    fromBranch: args.input.fromBranch,
    fromBranchKind: args.input.fromBranchKind,
    initialTaskTitle: proposal.firstTaskTitle,
    workspaceInformation: buildWorkspaceInformationSeed(proposal),
  });
  if (!createResult.ok) {
    return createResult;
  }

  const state = args.getState();
  const taskId = state.activeTaskId;
  const basePrompt =
    proposal.firstTaskPrompt.trim() || proposal.sourceSummary.trim();
  const extra = args.input.extraInstructions?.trim() ?? "";
  const prompt = extra
    ? `${basePrompt}\n\nAdditional instructions:\n${extra}`
    : basePrompt;
  if (taskId && args.input.firstTaskProvider) {
    state.setTaskProvider({
      taskId,
      provider: args.input.firstTaskProvider,
    });
  }
  if (!taskId || !prompt) {
    return {
      ok: true,
      noticeLevel: "warning",
      message: "Workspace created, but the first task prompt was empty.",
    };
  }

  if (!args.input.startFirstTask) {
    state.updatePromptDraft({
      taskId,
      patch: {
        text: prompt,
        runtimeOverrides: args.input.firstTaskRuntimeOverrides,
      },
    });
    return createResult;
  }

  const sendResult = await state.sendUserMessage({
    taskId,
    content: prompt,
    providerOverride: args.input.firstTaskProvider,
    runtimeOverrides: args.input.firstTaskRuntimeOverrides,
  });
  if (sendResult.status === "blocked") {
    args.getState().updatePromptDraft({
      taskId,
      patch: {
        text: prompt,
        runtimeOverrides: args.input.firstTaskRuntimeOverrides,
      },
    });
    return {
      ok: true,
      noticeLevel: "warning",
      message:
        "Workspace created. The first task could not start, so its prompt was kept in the composer.",
    };
  }
  return createResult;
}
