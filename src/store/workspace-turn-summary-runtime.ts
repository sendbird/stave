import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";
import type { WorkspaceTurnSummary } from "@/lib/workspace-information";
import type { ProjectMemoryFactInput } from "@/lib/project-memory";
import { inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import {
  resolveAuxLaneRuntime,
  supportsExplicitEffort,
} from "@/lib/providers/auxiliary-inference-policy";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { resolveWorkspacePathForId } from "@/store/workspace-file-cache";
import type { AppState } from "@/store/app-store.types";

/**
 * The Information panel's automatic latest-turn summary.
 *
 * Extracted from `app.store` so the store file stays under its max-lines
 * ratchet. The two collaborators it needs from the store — reading state and
 * writing the finished summary back — are injected rather than imported, so
 * this module has no dependency on the store's internal closures.
 */
export function createWorkspaceTurnSummaryGenerator(deps: {
  getState: () => AppState;
  applySummary: (args: {
    workspaceId: string;
    summary: WorkspaceTurnSummary;
  }) => void;
  /**
   * Project-memory candidates the same summary call surfaced (no extra LLM
   * call). Optional so existing callers and tests need no change.
   */
  rememberDurableFacts?: (args: {
    projectPath: string | null;
    taskId: string;
    turnId: string;
    facts: ProjectMemoryFactInput[];
  }) => void;
  collectProviderEvents: (
    value: unknown,
  ) => Promise<NormalizedProviderEvent[]>;
}) {
  const { collectProviderEvents, applySummary, rememberDurableFacts } = deps;
  // Only the newest request for a workspace may write a summary; an older
  // in-flight one must notice it was superseded and drop its result.
  const requestIdByWorkspaceId = new Map<string, string>();

  return (args: {
    workspaceId: string;
    taskId: string;
    turnId: string;
  }) => {
    const state = deps.getState();
    const session = getWorkspaceSessionForState({
      state,
      workspaceId: args.workspaceId,
    });
    if (!session) {
      return;
    }

    const currentSummary = session.workspaceInformation.turnSummary ?? null;
    if (currentSummary?.turnId === args.turnId) {
      return;
    }

    const task =
      session.tasks.find((item) => item.id === args.taskId) ?? null;
    const messages = session.messagesByTask[args.taskId] ?? [];
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user" && message.content.trim());
    const latestAssistantMessage = [...messages]
      .reverse()
      .find(
        (message) => message.role === "assistant" && message.content.trim(),
      );
    const summaryPrompt = state.settings.workspaceTurnSummaryPrompt.trim();
    if (!summaryPrompt) {
      return;
    }
    const summaryLane = resolveAuxLaneRuntime({
      lane: "turnSummary",
      policy: state.settings.auxiliaryInferencePolicy,
      activeProviderId: task?.provider ?? null,
    });
    if (!summaryLane.enabled) {
      return;
    }
    // A turn that produced no assistant prose has nothing to summarize; the
    // model would only restate the user's own request back at them.
    if (
      summaryLane.config.skipWithoutAssistantText &&
      !latestAssistantMessage?.content.trim()
    ) {
      return;
    }
    if (
      !latestUserMessage?.content.trim() &&
      !latestAssistantMessage?.content.trim()
    ) {
      return;
    }

    const workspacePath = resolveWorkspacePathForId({
      activeWorkspaceId: state.activeWorkspaceId,
      workspaceId: args.workspaceId,
      workspacePathById: state.workspacePathById,
      workspaceDefaultById: state.workspaceDefaultById,
      projectPath: state.projectPath,
    });
    const settingsSnapshot = state.settings;
    const candidateModels = [
      ...new Set(
        [summaryLane.model, summaryLane.fallbackModel]
          .map((model) => model?.trim() ?? "")
          .filter(Boolean),
      ),
    ];
    if (candidateModels.length === 0) {
      return;
    }

    const prompt = buildWorkspaceTurnSummaryPrompt({
      instructionPrompt: summaryPrompt,
      taskTitle: task?.title ?? null,
      userRequest:
        latestUserMessage?.content.trim() ||
        task?.title ||
        "No user request was captured for this turn.",
      assistantResponse:
        latestAssistantMessage?.content.trim() ||
        "The assistant completed the turn without a plain-text reply.",
    });
    const requestId = `${args.turnId}:${Date.now()}`;
    requestIdByWorkspaceId.set(
      args.workspaceId,
      requestId,
    );

    void (async () => {
      for (const [index, model] of candidateModels.entries()) {
        if (
          requestIdByWorkspaceId.get(args.workspaceId) !==
          requestId
        ) {
          return;
        }

        const providerId = inferProviderIdFromModel({ model });
        const runtimeOptions = {
          ...buildProviderRuntimeOptions({
            provider: providerId,
            model,
            settings: settingsSnapshot,
          }),
          chatStreamingEnabled: false,
          responseStylePrompt: undefined,
          promptPrDescription: undefined,
          promptInlineCompletion: undefined,
          ...(providerId === "claude-code"
            ? {
                claudeAllowedTools: [],
                claudeMaxTurns: 1,
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
          ...(supportsExplicitEffort({ providerId, model })
            ? summaryLane.effortOverrides
            : {}),
        };

        // The first candidate is probed by simply running it: an availability
        // check is a second process spawn for a call that is about to happen
        // anyway. Only the fallback earns a probe, because reaching it means
        // the primary already failed and a blind second failure is pure cost.
        if (index > 0 && window.api?.provider?.checkAvailability) {
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

        try {
          const streamTurn = window.api?.provider?.streamTurn;
          if (!streamTurn) {
            return;
          }
          const events = await collectProviderEvents(
            streamTurn({
              providerId,
              prompt,
              cwd: workspacePath ?? undefined,
              runtimeOptions,
            }),
          );
          const responseText = events
            .filter(
              (
                event,
              ): event is Extract<
                NormalizedProviderEvent,
                { type: "text" }
              > => event.type === "text",
            )
            .map((event) => event.text)
            .join("")
            .trim();
          const parsedSummary = responseText
            ? parseWorkspaceTurnSummaryResponse(responseText)
            : null;
          if (!parsedSummary) {
            continue;
          }

          if (
            requestIdByWorkspaceId.get(
              args.workspaceId,
            ) !== requestId
          ) {
            return;
          }

          applySummary({
            workspaceId: args.workspaceId,
            summary: createWorkspaceTurnSummary({
              turnId: args.turnId,
              taskId: args.taskId,
              taskTitle: task?.title ?? "Untitled Task",
              model,
              generatedAt: new Date().toISOString(),
              draft: parsedSummary,
            }),
          });
          if (parsedSummary.durableFacts.length > 0) {
            rememberDurableFacts?.({
              projectPath: state.projectPath,
              taskId: args.taskId,
              turnId: args.turnId,
              facts: parsedSummary.durableFacts,
            });
          }
          return;
        } catch {
          continue;
        }
      }
    })().finally(() => {
      if (
        requestIdByWorkspaceId.get(args.workspaceId) ===
        requestId
      ) {
        requestIdByWorkspaceId.delete(args.workspaceId);
      }
    });
  };
}
