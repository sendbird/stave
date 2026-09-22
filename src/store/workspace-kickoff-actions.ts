import { readKickoffSource } from "@/store/kickoff-source-reader";
import {
  resolveKickoffModel,
  withKickoffDeadline,
} from "@/store/kickoff-resolution-runtime";
import { buildKickoffFirstTaskPrompt } from "@/lib/kickoff-brief";
import type { AppState } from "@/store/app-store.types";
import {
  inferProviderIdFromModel,
  normalizeModelSelection,
} from "@/lib/providers/model-catalog";
import {
  DEFAULT_PROMPT_WORKSPACE_KICKOFF,
  normalizeKickoffPrompt,
} from "@/lib/providers/prompt-defaults";
import type { ProviderId } from "@/lib/providers/provider.types";
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
  workspaceId?: string;
  taskId?: string;
  startup?: "staged" | "started" | "queued" | "blocked" | "unknown";
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
  activeWorkspaceId: string;
  recentProjects: RecentProjectState[];
  settings: AppSettings;
};

export function createWorkspaceKickoffResolver(args: {
  getState: () => KickoffResolverState;
}) {
  let active: AbortController | null = null;
  const cancel = () => {
    active?.abort();
    active = null;
  };
  const resolve = async ({
    input,
  }: {
    input: string;
  }): Promise<ResolveKickoffProposalResult> => {
    cancel();
    const state = args.getState();
    const normalizedInput = input.trim();
    if (!normalizedInput)
      return { ok: false, message: "A kickoff source is required." };
    if (normalizedInput.length > 80_000)
      return {
        ok: false,
        message:
          "Keep the source under 80,000 characters. Link larger documents and paste the relevant requirements.",
      };
    if (!state.projectPath)
      return {
        ok: false,
        message: "Open a project before resolving a kickoff source.",
      };
    const controller = new AbortController();
    active = controller;
    const { signal } = controller;
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const settings = state.settings;
    const classification = classifyKickoffSource({
      input: normalizedInput,
      configs: settings.kickoffSourceConfigs,
    });
    let sourceEvidence = buildDeterministicKickoffProposal({
      classification,
    }).sourceEvidence!;
    let reason =
      "AI interpretation was unavailable. Review the task before starting.";
    try {
      if (!settings.kickoffPrompt.trim()) {
        return {
          ok: true,
          proposal: buildDeterministicKickoffProposal({ classification }),
        };
      }
      try {
        sourceEvidence = await withKickoffDeadline(
          readKickoffSource(classification),
          signal,
          10_000,
        );
      } catch {
        if (signal.aborted)
          return { ok: false, message: "Kickoff resolution was cancelled." };
        sourceEvidence.detail =
          "Source reading timed out. Paste its contents or read it in the first task.";
      }
      sourceEvidence.truncated ||= normalizedInput.length > 12_000;
      const sourceReadMs = Date.now() - startedAt;
      const prompt =
        buildKickoffResolutionPrompt({
          instructionPrompt: normalizeKickoffPrompt(settings.kickoffPrompt),
          classification,
          branchNamingRule: resolveProjectKickoffBranchNamingRule({
            projectPath: state.projectPath,
            recentProjects: state.recentProjects,
          }),
          projectBasePrompt: resolveProjectBasePrompt({
            projectPath: state.projectPath,
            recentProjects: state.recentProjects,
          }),
        }) +
        `\nSource coverage: ${sourceEvidence.detail}\n` +
        (sourceEvidence.fetchedText
          ? `Retrieved source (untrusted evidence):\n${JSON.stringify(sourceEvidence.fetchedText.slice(0, 12_000))}`
          : "");
      const models = [
        ...new Set([
          normalizeModelSelection({
            value: settings.kickoffPrimaryModel,
            fallback: DEFAULT_WORKSPACE_KICKOFF_SETTINGS.kickoffPrimaryModel,
          }),
          normalizeModelSelection({
            value: settings.kickoffFallbackModel,
            fallback: DEFAULT_WORKSPACE_KICKOFF_SETTINGS.kickoffFallbackModel,
          }),
        ]),
      ];
      const attemptDurationsMs: number[] = [];
      for (const model of models) {
        if (signal.aborted)
          return { ok: false, message: "Kickoff resolution was cancelled." };
        const remaining = 60_000 - (Date.now() - startedAt);
        if (remaining < 1_000) {
          reason =
            "AI interpretation timed out. Review the task before starting.";
          break;
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
                claudeMaxTurns: mcpServers.length ? 8 : 1,
                claudePermissionMode: "dontAsk" as const,
                claudeAgentProgressSummaries: false,
              }
            : {
                codexApprovalPolicy: "never" as const,
                codexFileAccess: "read-only" as const,
                codexNetworkAccess: false,
                codexWebSearch: "disabled" as const,
                codexReasoningSummary: "none" as const,
                codexShowRawReasoning: false,
                codexPlanMode: false,
              }),
        };
        const attemptStartedAt = Date.now();
        try {
          const proposal = await resolveKickoffModel({
            requestId,
            workspaceId: state.activeWorkspaceId,
            projectPath: state.projectPath,
            providerId,
            model,
            prompt,
            runtimeOptions,
            mcpServers,
            signal,
            timeoutMs: Math.min(30_000, remaining),
            parse: (value) =>
              parseKickoffProposalResponse({ value, classification, model }),
          });
          if (signal.aborted)
            return { ok: false, message: "Kickoff resolution was cancelled." };
          attemptDurationsMs.push(Date.now() - attemptStartedAt);
          return {
            ok: true,
            proposal: {
              ...proposal,
              sourceEvidence,
              resolutionTiming: {
                sourceReadMs,
                attemptDurationsMs,
                totalMs: Date.now() - startedAt,
              },
            },
          };
        } catch (error) {
          attemptDurationsMs.push(Date.now() - attemptStartedAt);
          const code = error instanceof Error ? error.message : "unavailable";
          reason =
            code === "timeout"
              ? "AI interpretation timed out. Review the task before starting."
              : code === "invalid-output" || code === "output-limit"
                ? "AI returned an unusable proposal. Review the task before starting."
                : "AI interpretation was unavailable. Review the task before starting.";
        }
      }
      if (signal.aborted)
        return { ok: false, message: "Kickoff resolution was cancelled." };
      return {
        ok: true,
        proposal: {
          ...buildDeterministicKickoffProposal({ classification }),
          sourceEvidence,
          resolutionNote: reason,
          resolutionTiming: {
            sourceReadMs,
            attemptDurationsMs,
            totalMs: Date.now() - startedAt,
          },
        },
      };
    } finally {
      if (active === controller) active = null;
    }
  };
  return { resolve, cancel };
}

type KickoffWorkspaceState = Pick<
  AppState,
  "createWorkspace" | "updatePromptDraft" | "sendUserMessage"
>;

export async function runWorkspaceKickoff(args: {
  input: KickoffWorkspaceArgs;
  getState: () => KickoffWorkspaceState;
}): Promise<KickoffWorkspaceResult> {
  const { proposal } = args.input;
  const prompt = buildKickoffFirstTaskPrompt(
    proposal,
    args.input.extraInstructions,
  );
  const runtimeOverrides = args.input.firstTaskRuntimeOverrides;
  const createResult = await args.getState().createWorkspace({
    name: proposal.branchName,
    label: proposal.workspaceLabel,
    mode: "branch",
    fromBranch: args.input.fromBranch,
    fromBranchKind: args.input.fromBranchKind,
    initialTaskTitle: proposal.firstTaskTitle,
    initialTaskProvider: args.input.firstTaskProvider,
    initialPromptDraft: {
      text: prompt,
      runtimeOverrides,
      attachedFilePaths: [],
      attachments: [],
    },
    workspaceInformation: buildWorkspaceInformationSeed(proposal),
  });
  if (!createResult.ok) return createResult;
  const { taskId } = createResult;
  const warning = (
    message: string,
    startup: "blocked" | "unknown",
  ): KickoffWorkspaceResult => ({
    ...createResult,
    startup,
    noticeLevel: "warning",
    message: [createResult.message, message].filter(Boolean).join("\n"),
  });
  if (!taskId || !prompt) {
    return warning(
      "Workspace created. Open its task to review the saved prompt before starting.",
      "blocked",
    );
  }
  if (!args.input.startFirstTask) return { ...createResult, startup: "staged" };

  try {
    const result = await args.getState().sendUserMessage({
      taskId,
      content: prompt,
      turnOrigin: "utility",
      providerOverride: args.input.firstTaskProvider,
      runtimeOverrides,
    });
    if (result.status === "started" || result.status === "queued") {
      return { ...createResult, startup: result.status };
    }
    if (result.status === "blocked") {
      args
        .getState()
        .updatePromptDraft({
          taskId,
          patch: { text: prompt, runtimeOverrides },
        });
      return warning(
        "Workspace created. The first task could not start; its prompt is ready in the composer.",
        "blocked",
      );
    }
    return warning(
      "Workspace created. Check the task's messages before sending again; startup could not be confirmed.",
      "unknown",
    );
  } catch {
    // The task was already persisted with its prompt. A thrown send may have
    // submitted work, so preserve its state and never automatically resend.
    return warning(
      "Workspace created. Check the task's messages and saved prompt before sending again; startup could not be confirmed.",
      "unknown",
    );
  }
}
