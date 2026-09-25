import type { AppState, SendUserMessageResult } from "@/store/app-store.types";
import {
  CanonicalRetrievedContextPart,
  NormalizedProviderEvent,
} from "@/lib/providers/provider.types";
import { resolveAuxLaneRuntime } from "@/lib/providers/auxiliary-inference-policy";
import { eventsIndicateFileEdits } from "@/lib/providers/tool-names";
import { collectTurnStartRetrievedContextParts } from "@/store/project-memory-runtime";
import { buildCurrentTaskAwarenessRetrievedContextParts } from "@/lib/task-context/current-task-awareness";
import { buildReferencedTaskRetrievedContext } from "@/lib/task-context/referenced-task-context";
import {
  extractWorkspaceInformationReferencesFromText,
  formatWorkspaceInformationReferencesContext,
  type LensReferenceState,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";
import { parkFailedOutgoingSend } from "@/store/app-store-failed-send-actions";
import { createSubmittedPromptDraftLifecycle } from "@/store/submitted-prompt-draft-lifecycle";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { getProviderSessionCursor } from "@/lib/providers/provider-sessions";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { resolveTurnModelInfo } from "@/lib/providers/turn-model-info";
import { buildAutoRoutingDecisionRecord } from "@/store/auto-routing";
import {
  buildAutoRoutingModelResolution,
  isAutoRoutingUnavailableForSend,
  resolveAutoRoutingForSend,
  resolveDelegatedRuntimeOverrides,
} from "@/store/auto-routing-dispatch";
import { partitionStalePrContexts } from "@/lib/pr-context";
import { isTaskManaged } from "@/lib/tasks";
import { resolveSkillSelections } from "@/lib/skills/catalog";
import { buildAdvisorExchangePatch } from "@/lib/providers/advisor-activity";
import {
  resolveProviderTurnDisplayState,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";
import { noteRateLimitsProviderActivity } from "@/lib/providers/rate-limits-poll-policy";
import { buildTurnActivityFlushPatch } from "@/store/turn-activity-retention";
import {
  applyDetectedWorkspaceResources,
  detectWorkspaceResourcesInText,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import {
  finishCompareRunsForTask,
  resolveCompareTurnOutcome,
} from "@/lib/compare-runs";
import { launchReadyCompareJudgesFromStore } from "@/store/compare-run-judge";
import {
  applyProjectBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  buildUtilityInferenceContext,
} from "@/store/provider-runtime-options";
import { maybeSuggestUtilityTaskName } from "@/store/utility-inference-runtime";
import {
  buildPendingProviderTurnState,
  buildRecentTimestamp,
  resolveMidTurnSteeringContext,
} from "@/store/chat-state-helpers";
import {
  createProviderTurnEventController,
  runProviderTurn,
} from "@/store/provider-turn-runtime";
import { guardSendAgainstAccountUsage } from "@/store/account-usage-guard";
import { toast } from "@/lib/notifications/toast";
import { applySteeredTurnState } from "@/store/steer-turn-state";
import {
  createWebFetchAuthWallTracker,
  maybeStartProviderBrowserFallbackTurn,
} from "@/store/provider-browser-auto-fallback";
import { buildFailedSteerResult } from "@/store/steer-submit";
import {
  applyPendingProviderEventsToStoreState,
  getWorkspaceSessionForState,
} from "@/store/workspace-runtime-state";
import type { Attachment, PromptDraft, Task } from "@/types/chat";
import {
  buildCodexGoalQueuedTurns,
  buildQueuedTurnFromDraft,
  getDraftFileContexts,
  getDraftImageContexts,
  getPromptDraftAttachments,
  promptDraftReferencesLens,
} from "@/store/prompt-draft-context";
import {
  buildPromptDraftContentForSend,
  buildPromptDraftDisplayContentForSend,
  buildPromptDraftDisplayPartsForSend,
} from "@/store/prompt-draft-message-content";
import {
  applyAutoRoutingPlanMode,
  resolvePromptDraftRuntimeState,
  resolveTurnModelForSend,
} from "@/store/prompt-draft-runtime";
import {
  buildPreservedQueuedDraft,
  resolvePromptDraftAfterSend,
  resolvePromptDraftSendState,
} from "@/store/prompt-draft-send";
import {
  buildClearedPromptDraft,
  hasPromptDraftPayload,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import {
  resolveWorkspacePlanPersistenceText,
  persistWorkspacePlanFile,
} from "@/lib/plans";
import {
  scheduleWorkspaceSnapshotPersist,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  resolveProjectBasePrompt,
  resolveWorkspaceName,
  resolveTaskWorkspaceContext,
} from "@/store/project.utils";
import {
  buildApprovalNotificationInputs,
  buildTaskTurnCompletedNotificationInput,
  buildTaskTurnFailedNotificationInput,
  buildUserInputNotificationInputs,
  findTrustedApprovalResponses,
} from "@/store/app-notification-builders";
import type { StoreApi } from "zustand";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import type { createAppStoreNotificationRuntime } from "@/store/app-store-notification-runtime";
import type { createProviderTurnStallTimerScheduler } from "@/store/provider-turn-stall-abort";
import type { createProviderTurnLivenessReporter } from "@/store/provider-turn-stall-rearm";
import type { createSteerQueueReservations } from "@/store/steer-queue-reservations";
import type { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import type { createWorkspaceTurnSummaryGenerator } from "@/store/workspace-turn-summary-runtime";
import type { ScriptTrigger } from "@/lib/workspace-scripts";

function buildWorkspaceInformationReferencesRetrievedContext(args: {
  promptDraft: PromptDraft;
  workspaceInformation: WorkspaceInformationState;
  lensState?: LensReferenceState | null;
}): CanonicalRetrievedContextPart | null {
  const referencesByKey = new Map<string, WorkspaceInformationReference>();
  const addReference = (reference: WorkspaceInformationReference) => {
    const key =
      reference.scope === "section"
        ? `${reference.section}:section`
        : `${reference.section}:item:${reference.itemId ?? ""}`;
    referencesByKey.set(key, reference);
  };

  getPromptDraftAttachments(args.promptDraft)
    .filter(
      (
        attachment,
      ): attachment is Extract<Attachment, { kind: "workspace-information" }> =>
        attachment.kind === "workspace-information",
    )
    .forEach((attachment) => addReference(attachment.reference));

  [
    args.promptDraft.text,
    ...(args.promptDraft.promptBatch ?? []).map((item) => item.content),
    ...(args.promptDraft.queuedTurns ?? []).map((item) => item.content),
  ].forEach((text) => {
    extractWorkspaceInformationReferencesFromText(text).forEach(addReference);
  });

  const references = [...referencesByKey.values()];
  if (references.length === 0) {
    return null;
  }

  const content = formatWorkspaceInformationReferencesContext({
    info: args.workspaceInformation,
    references,
    lens: args.lensState ?? null,
  });
  if (!content.trim()) {
    return null;
  }

  return {
    type: "retrieved_context",
    sourceId: "stave:workspace-information-references",
    title: "Explicit Information Panel References",
    content: [
      "The user explicitly referenced these Information panel entries from the prompt composer.",
      "Treat section references as the full current section and item references as the specific item.",
      ...(references.some((reference) => reference.section === "lens")
        ? [
            "`@lens` refers to the built-in Lens browser panel and its currently loaded page.",
          ]
        : []),
      "",
      content,
    ].join("\n"),
  };
}

type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createSendUserMessageAction(args: {
  set: StoreSet;
  get: StoreGet;
  emptyPromptDraft: PromptDraft;
  resolveTaskRuntimeTarget: (args: { state: AppState; taskId: string }) => {
    workspaceId: string;
    isActiveWorkspace: boolean;
    session: WorkspaceSessionState;
    task: Task;
  } | null;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
  findTaskById: (state: Pick<AppState, "tasks">, taskId: string) => Task | null;
  recordTurnFileEdits: (turnId: string) => void;
  runScriptHookInBackground: (args: {
    workspaceId: string;
    trigger: ScriptTrigger;
    taskId?: string;
    taskTitle?: string;
    turnId?: string;
  }) => void;
  clearProviderTurnStallTimer: (taskId: string) => void;
  scheduleProviderTurnStallTimer: ReturnType<
    typeof createProviderTurnStallTimerScheduler
  >;
  reportProviderTurnLiveness: ReturnType<
    typeof createProviderTurnLivenessReporter
  >;
  steerQueueReservations: ReturnType<typeof createSteerQueueReservations>;
  dispatchNextQueuedTaskTurn: ReturnType<typeof createQueuedTaskTurnDispatcher>;
  drainQueueAfterSteerSettled: (target: {
    workspaceId: string;
    taskId: string;
  }) => void;
  persistWorkspaceSessionInBackground: (args: {
    workspaceId: string;
    session: WorkspaceSessionState;
  }) => void;
  generateWorkspaceTurnSummaryInBackground: ReturnType<
    typeof createWorkspaceTurnSummaryGenerator
  >;
  attentionSync: NotificationAttentionSync;
  persistNotifications: ReturnType<
    typeof createAppStoreNotificationRuntime
  >["persistNotifications"];
}): AppState["sendUserMessage"] {
  const {
    set,
    get,
    emptyPromptDraft: EMPTY_PROMPT_DRAFT,
    resolveTaskRuntimeTarget,
    incrementWorkspaceSnapshotVersion,
    findTaskById,
    recordTurnFileEdits,
    runScriptHookInBackground,
    clearProviderTurnStallTimer,
    scheduleProviderTurnStallTimer,
    reportProviderTurnLiveness,
    steerQueueReservations,
    dispatchNextQueuedTaskTurn,
    drainQueueAfterSteerSettled,
    persistWorkspaceSessionInBackground,
    generateWorkspaceTurnSummaryInBackground,
    attentionSync,
    persistNotifications,
  } = args;
  return async ({
    taskId,
    content,
    providerOverride,
    runtimeOverrides,
    preservePromptDraft,
    fileContexts,
    imageContexts,
    submitIntent,
    turnOrigin,
    queuedTurnId,
    attachedFilePaths: payloadAttachedFilePaths,
    attachments: payloadAttachments,
  }) => {
    const turnId = crypto.randomUUID();
    let state = get();
    let resolvedTaskId = taskId;
    const sourcePromptDraftTaskId = taskId || "draft:session";
    let sourcePromptDraft =
      state.promptDraftByTask[sourcePromptDraftTaskId] ?? EMPTY_PROMPT_DRAFT;
    let runtimeTarget = resolvedTaskId
      ? resolveTaskRuntimeTarget({
          state,
          taskId: resolvedTaskId,
        })
      : null;
    let task = runtimeTarget?.task ?? null;
    const hasActiveTurn = Boolean(
      task && runtimeTarget?.session.activeTurnIdsByTask[task.id],
    );

    if (!task) {
      const seededTaskId = crypto.randomUUID();
      const seededProvider =
        providerOverride ?? state.draftProvider ?? "claude-code";
      const seededTitleText = resolveSkillSelections({
        text: content,
        skills: state.skillCatalog.skills,
        providerId: seededProvider,
      }).normalizedText;
      const seededTitle =
        seededTitleText.split("\n")[0]?.trim().slice(0, 48) || "New Task";
      const seededTask: Task = {
        id: seededTaskId,
        title: seededTitle,
        provider: seededProvider,
        updatedAt: buildRecentTimestamp(),
        unread: false,
        archivedAt: null,
        controlMode: "interactive",
        controlOwner: "stave",
      };
      set((nextState) => ({
        tasks: [seededTask, ...nextState.tasks],
        activeTaskId: seededTaskId,
        messagesByTask: {
          ...nextState.messagesByTask,
          [seededTaskId]: nextState.messagesByTask[seededTaskId] ?? [],
        },
        messageCountByTask: {
          ...nextState.messageCountByTask,
          [seededTaskId]: nextState.messageCountByTask[seededTaskId] ?? 0,
        },
        nativeSessionReadyByTask: {
          ...nextState.nativeSessionReadyByTask,
          [seededTaskId]: false,
        },
        providerSessionByTask: {
          ...nextState.providerSessionByTask,
          [seededTaskId]: {},
        },
        taskWorkspaceIdById: {
          ...nextState.taskWorkspaceIdById,
          [seededTaskId]: nextState.activeWorkspaceId,
        },
        promptDraftByTask: {
          ...nextState.promptDraftByTask,
          [seededTaskId]: {
            text: "",
            attachedFilePaths: [],
            attachments: [],
            ...(sourcePromptDraft.runtimeOverrides
              ? { runtimeOverrides: sourcePromptDraft.runtimeOverrides }
              : {}),
          },
        },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(nextState),
      }));
      state = get();
      resolvedTaskId = seededTaskId;
      sourcePromptDraft =
        state.promptDraftByTask[sourcePromptDraftTaskId] ?? EMPTY_PROMPT_DRAFT;
      runtimeTarget = resolveTaskRuntimeTarget({
        state,
        taskId: resolvedTaskId,
      });
      task = seededTask;
    }
    if (!task || !runtimeTarget) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    if (isTaskManaged(findTaskById(state, resolvedTaskId))) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    let provider =
      providerOverride ??
      task?.provider ??
      state.draftProvider ??
      "claude-code";
    const { workspaceId: taskWorkspaceId, cwd: workspaceCwd } =
      resolveTaskWorkspaceContext({
        taskId: resolvedTaskId,
        activeWorkspaceId: state.activeWorkspaceId,
        taskWorkspaceIdById: state.taskWorkspaceIdById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        projectPath: state.projectPath,
      });
    if (!taskWorkspaceId) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    // `resolveTaskWorkspaceContext` deliberately returns no cwd when the
    // task's workspace has no known path, so the turn cannot borrow another
    // workspace's folder. Stop the send here: dispatching without a cwd
    // would run the task wherever the host process happens to live.
    if (!workspaceCwd) {
      const message =
        "This task's workspace folder could not be resolved, so the turn would run outside the workspace. Reopen or relink the workspace and send again.";
      toast.warning("Workspace folder unavailable", {
        description: message,
      });
      return {
        status: "blocked",
        reason: "workspace-path-missing",
        message,
      } satisfies SendUserMessageResult;
    }
    const taskWorkspaceSession =
      getWorkspaceSessionForState({
        state,
        workspaceId: taskWorkspaceId,
      }) ?? runtimeTarget.session;
    const runCommand = window.api?.terminal?.runCommand;

    if (!state.taskCheckpointById[resolvedTaskId] && runCommand) {
      void runCommand({
        cwd: workspaceCwd,
        command: "git rev-parse HEAD",
      }).then((result) => {
        if (!result.ok) {
          return;
        }
        const checkpoint = result.stdout.trim().split("\n")[0]?.trim();
        if (!checkpoint) {
          return;
        }
        set((nextState) => ({
          taskCheckpointById: {
            ...nextState.taskCheckpointById,
            [resolvedTaskId]: checkpoint,
          },
        }));
      });
    }

    const existingHistory =
      taskWorkspaceSession.messagesByTask[resolvedTaskId] ?? [];
    if (findLatestPendingApproval({ messages: existingHistory })) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    if (findLatestPendingUserInput({ messages: existingHistory })) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    const storedPromptDraftForTask =
      taskWorkspaceSession.promptDraftByTask[resolvedTaskId];
    const promptDraftSendState = resolvePromptDraftSendState({
      content,
      preservePromptDraft,
      runtimeOverrides,
      sourceDraft: sourcePromptDraft,
      storedDraft: storedPromptDraftForTask,
      queuedTurnId,
      payloadAttachedFilePaths,
      payloadAttachments,
    });
    if (!promptDraftSendState) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    const { promptDraft, queuedTurnToSend, remainingQueuedTurns } =
      promptDraftSendState;
    if (
      isAutoRoutingUnavailableForSend({
        promptDraft,
        autoRoutingEnabled: state.settings.autoRoutingEnabled,
        steeringActiveTurn: hasActiveTurn && submitIntent === "steer",
      })
    ) {
      const message =
        "Stave Auto is turned off. Enable it in Settings or choose a provider model before sending.";
      toast.warning("Stave Auto is unavailable", { description: message });
      return {
        status: "blocked",
        reason: "auto-routing-disabled",
        message,
      } satisfies SendUserMessageResult;
    }
    const composerDraft = runtimeOverrides
      ? normalizePromptDraftForStorage({
          ...promptDraft,
          runtimeOverrides:
            storedPromptDraftForTask?.runtimeOverrides ??
            sourcePromptDraft.runtimeOverrides,
        })
      : promptDraft;
    // A queued turn dispatches on the provider captured when it was
    // queued (auto and manual dispatch alike); the composer's current
    // selection only applies to new sends. Legacy queue items without a
    // stored provider keep following the task's current provider. Stave
    // Auto items re-route at dispatch instead of pinning the task model.
    if (queuedTurnToSend?.providerId && !queuedTurnToSend.autoRouting) {
      provider = queuedTurnToSend.providerId;
    }
    const codexGoalQueuedTurns = buildCodexGoalQueuedTurns({
      provider,
      content,
      turnId,
    });
    const promptContent = buildPromptDraftContentForSend(promptDraft);
    const promptDisplayContent =
      buildPromptDraftDisplayContentForSend(promptDraft);
    const promptDisplayParts = buildPromptDraftDisplayPartsForSend(promptDraft);
    const activeTurnId =
      taskWorkspaceSession.activeTurnIdsByTask[resolvedTaskId];
    // A "stalled" turn is one whose provider stream has gone silent past the
    // stall threshold with no pending approval/user_input interaction — e.g. a
    // background task that never emitted `done`, or one whose runtime died. In
    // that state, queuing would strand the user in a spinner forever, so instead
    // interrupt the dead turn and send this message as a fresh turn. This mirrors
    // the manual "Stop, then send" flow (and, like it, does not resume the
    // aborted provider session). Live/streaming turns and turns waiting on an
    // approval or AskUserQuestion prompt are NOT stalled and still queue.
    const activeTurnStalled =
      !!activeTurnId &&
      resolveProviderTurnDisplayState({
        activeTurnId,
        activity: get().providerTurnActivityByTask[resolvedTaskId],
      }) === "stalled";
    if (activeTurnId && activeTurnStalled) {
      get().abortTaskTurn({ taskId: resolvedTaskId });
    }
    // Steer is the one dispatch path that opens a provider reservation
    // synchronously right after the off-limits check below. Run the
    // account-usage guard here, before that window, so its `await` never
    // interleaves with a concurrent steer racing for the same queued item.
    if (activeTurnId && !activeTurnStalled && submitIntent === "steer") {
      const activeTurnAssistantMessage = [...existingHistory]
        .reverse()
        .find(
          (message) =>
            message.turnId === activeTurnId && message.role === "assistant",
        );
      const steerAccountUsageBlock = await guardSendAgainstAccountUsage(
        get,
        providerOverride ??
          task?.provider ??
          state.draftProvider ??
          "claude-code",
        { model: activeTurnAssistantMessage?.model },
      );
      if (steerAccountUsageBlock) return steerAccountUsageBlock;
    }
    // A queued item dispatched during a live turn is already in line to
    // auto-dispatch, so sending it here would duplicate it — unless the
    // caller explicitly asked to steer, which promotes it into the running
    // turn instead of waiting (see the steer branch below). An item whose
    // own steer is still in flight is off limits to every path, steer
    // included: the provider may be about to accept it.
    if (
      queuedTurnToSend &&
      (steerQueueReservations.blocksDispatch({
        taskId: resolvedTaskId,
        queuedTurnId: queuedTurnToSend.id,
      }) ||
        (activeTurnId && !activeTurnStalled && submitIntent !== "steer"))
    ) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }
    if (activeTurnId && !activeTurnStalled && submitIntent === "steer") {
      // Mid-turn steering: an explicit user choice (Enter, mirroring
      // Codex CLI), not a priority/fallback pair with queueing (Tab).
      // Every eligibility gate below is a hard requirement — if any
      // fails, this returns `steer-unavailable` immediately and does
      // NOT fall through to the queue path. The caller decides what to
      // do with that (e.g. tell the user to press Tab to queue).
      const steerTurn = window.api?.provider?.steerTurn;
      if (!steerTurn) {
        return {
          status: "steer-unavailable",
          taskId: resolvedTaskId,
          workspaceId: taskWorkspaceId,
          message: "Mid-turn steering is not available in this build.",
        } satisfies SendUserMessageResult;
      }
      const steeringContext = resolveMidTurnSteeringContext({
        activeTurnId,
        activity: state.providerTurnActivityByTask[resolvedTaskId],
        fallbackProviderId: provider,
        messages: existingHistory,
        hasAttachments:
          (promptDraft.attachments?.length ?? 0) > 0 ||
          (promptDraft.attachedFilePaths?.length ?? 0) > 0,
      });
      if (steeringContext.unavailableMessage) {
        return {
          status: "steer-unavailable",
          taskId: resolvedTaskId,
          workspaceId: taskWorkspaceId,
          message: steeringContext.unavailableMessage,
        } satisfies SendUserMessageResult;
      }
      const activeTurnProvider = steeringContext.providerId;
      const clientMessageId = crypto.randomUUID();
      const steerResult = await steerQueueReservations.submitSteer({
        taskId: resolvedTaskId,
        queuedTurnId: queuedTurnToSend?.id,
        send: steerTurn,
        request: {
          turnId: activeTurnId,
          text: promptContent,
          enabled: get().settings.midTurnSteeringEnabled,
          clientMessageId,
        },
      });
      if (!steerResult.ok) {
        // The steered item is back in the queue (rejected) or held out of
        // automatic dispatch (unconfirmed). Either way the turn it was
        // aimed at may have finished while the provider was deciding, so
        // re-check the queue: turn completion already ran and skipped it.
        drainQueueAfterSteerSettled({
          workspaceId: taskWorkspaceId,
          taskId: resolvedTaskId,
        });
        return buildFailedSteerResult({
          result: steerResult,
          taskId: resolvedTaskId,
          workspaceId: taskWorkspaceId,
        });
      }
      set((nextState) =>
        applySteeredTurnState({
          state: nextState,
          workspaceId: taskWorkspaceId,
          taskId: resolvedTaskId,
          turnId: activeTurnId,
          providerId: activeTurnProvider,
          content: promptContent,
          clientMessageId,
          storedDraft: storedPromptDraftForTask,
          sourceDraft: sourcePromptDraft,
          sentDraft: promptDraft,
          preservePromptDraft,
          steeredQueuedTurn: queuedTurnToSend,
          incrementWorkspaceSnapshotVersion,
        }),
      );
      // Runs after the state update above has taken the steered item out
      // of the queue, so a drain here can never re-send it.
      drainQueueAfterSteerSettled({
        workspaceId: taskWorkspaceId,
        taskId: resolvedTaskId,
      });
      return {
        status: "steered",
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
        turnId: activeTurnId,
      } satisfies SendUserMessageResult;
    }
    if (activeTurnId && !activeTurnStalled) {
      // submitIntent is "queue" or omitted: queue unconditionally, with
      // no steer attempt at all — this is byte-for-byte the pre-steering
      // behavior for every caller that doesn't explicitly opt into
      // "steer" (suggestion clicks, PlanViewer, etc.).
      const queuedTurn = buildQueuedTurnFromDraft({
        draft: promptDraft,
        settings: state.settings,
        sourceTurnId: activeTurnId,
        content: promptContent,
        ...(promptDraft.runtimeOverrides?.autoRouting === true
          ? { autoRouting: true }
          : {
              // Pin the selection at queue time so switching provider/model
              // while the current turn streams never retargets queued turns.
              providerId: provider,
              model: resolveTurnModelForSend({
                providerId: provider,
                runtimeOverrides: promptDraft.runtimeOverrides,
                settings: state.settings,
              }),
            }),
      });
      const storedDraft =
        taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
        sourcePromptDraft;
      const queuedPromptDraft = normalizePromptDraftForStorage({
        ...storedDraft,
        ...(preservePromptDraft
          ? {}
          : {
              text: "",
              attachedFilePaths: [],
              attachments: [],
              promptBatch: undefined,
            }),
        queuedTurns: [...(storedDraft.queuedTurns ?? []), queuedTurn],
        queuedNextTurn: undefined,
      });
      set((nextState) => {
        if (taskWorkspaceId === nextState.activeWorkspaceId) {
          return {
            promptDraftByTask: {
              ...nextState.promptDraftByTask,
              [resolvedTaskId]: queuedPromptDraft,
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          };
        }

        const cachedSession =
          nextState.workspaceRuntimeCacheById[taskWorkspaceId];
        if (!cachedSession) {
          return nextState;
        }

        return {
          workspaceRuntimeCacheById: {
            ...nextState.workspaceRuntimeCacheById,
            [taskWorkspaceId]: {
              ...cachedSession,
              promptDraftByTask: {
                ...cachedSession.promptDraftByTask,
                [resolvedTaskId]: queuedPromptDraft,
              },
            },
          },
        };
      });
      return {
        status: "queued",
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
      } satisfies SendUserMessageResult;
    }
    if (!hasPromptDraftPayload(promptDraft)) {
      return { status: "blocked" } satisfies SendUserMessageResult;
    }

    const updatePromptDraftsForWorkspace = (
      draftsByTaskId: Record<string, PromptDraft>,
    ) => {
      set((nextState) => {
        if (taskWorkspaceId === nextState.activeWorkspaceId) {
          return {
            promptDraftByTask: {
              ...nextState.promptDraftByTask,
              ...draftsByTaskId,
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          };
        }

        const cachedSession =
          nextState.workspaceRuntimeCacheById[taskWorkspaceId];
        if (!cachedSession) {
          return nextState;
        }

        return {
          workspaceRuntimeCacheById: {
            ...nextState.workspaceRuntimeCacheById,
            [taskWorkspaceId]: {
              ...cachedSession,
              promptDraftByTask: {
                ...cachedSession.promptDraftByTask,
                ...draftsByTaskId,
              },
            },
          },
        };
      });
    };

    // Manual queued-turn dispatch keeps the composer draft intact and
    // only removes the dispatched item from the queue; a normal send
    // clears the submitted draft.
    const preservedQueuedDispatchDraft = buildPreservedQueuedDraft({
      sourceDraft: storedPromptDraftForTask ?? sourcePromptDraft,
      queuedTurn: queuedTurnToSend,
      queuedTurns: codexGoalQueuedTurns,
      remainingQueuedTurns,
    });
    const draftAfterSend = (currentDraft?: PromptDraft) =>
      resolvePromptDraftAfterSend({
        currentDraft,
        storedDraft: storedPromptDraftForTask,
        sourceDraft: sourcePromptDraft,
        sentDraft: promptDraft,
        preservePromptDraft,
        preservedQueuedDraft: preservedQueuedDispatchDraft,
        queuedTurns: codexGoalQueuedTurns,
      });

    const submittedPromptDraft = createSubmittedPromptDraftLifecycle({
      taskId: resolvedTaskId,
      sourceTaskId: sourcePromptDraftTaskId,
      preservePromptDraft,
      promptDraft,
      composerDraft,
      sourcePromptDraft,
      storedDraft: storedPromptDraftForTask,
      preservedQueuedDispatchDraft,
      queuedTurns: codexGoalQueuedTurns,
      queuedTurnToSend,
      updateDrafts: updatePromptDraftsForWorkspace,
    });

    submittedPromptDraft.clear();

    try {
      // A queued turn's stored model (queue-time selection) wins over the
      // composer's current override; see resolveTurnModelForSend.
      let activeModel = resolveTurnModelForSend({
        providerId: provider,
        queuedTurnModel: queuedTurnToSend?.autoRouting
          ? undefined
          : queuedTurnToSend?.model,
        runtimeOverrides: promptDraft.runtimeOverrides,
        settings: state.settings,
      });

      const resolvedFileContexts = await getDraftFileContexts({
        promptDraft,
        session: taskWorkspaceSession,
        workspaceRootPath: workspaceCwd,
        fileContexts,
      });
      const resolvedImageContexts = getDraftImageContexts({
        promptDraft,
        imageContexts,
        includeLensCommentImages:
          state.settings.lensVisualCommentScreenshotsAsImageContext,
      });
      state = get();
      const latestWorkspaceSession = getWorkspaceSessionForState({
        state,
        workspaceId: taskWorkspaceId,
      });
      if (!latestWorkspaceSession) {
        submittedPromptDraft.restore();
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      const latestHistory =
        latestWorkspaceSession.messagesByTask[resolvedTaskId] ??
        existingHistory;
      if (latestWorkspaceSession.activeTurnIdsByTask[resolvedTaskId]) {
        submittedPromptDraft.restore();
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      if (
        findLatestPendingApproval({ messages: latestHistory }) ||
        findLatestPendingUserInput({ messages: latestHistory })
      ) {
        submittedPromptDraft.restore();
        return { status: "blocked" } satisfies SendUserMessageResult;
      }

      const autoRoutingDecision = await resolveAutoRoutingForSend({
        taskId: resolvedTaskId,
        state,
        promptDraft,
        provider,
        activeModel,
        prompt: promptContent,
        history: latestHistory,
        fileContextCount: resolvedFileContexts.length,
        workspaceCwd,
      });
      const afterRouting = get();
      const routedSession = getWorkspaceSessionForState({
        state: afterRouting,
        workspaceId: taskWorkspaceId,
      });
      if (
        !routedSession?.tasks.some((entry) => entry.id === resolvedTaskId) ||
        routedSession.activeTurnIdsByTask[resolvedTaskId] ||
        (autoRoutingDecision && !afterRouting.settings.autoRoutingEnabled)
      ) {
        submittedPromptDraft.restore();
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      if (autoRoutingDecision) {
        provider = autoRoutingDecision.providerId;
        activeModel = autoRoutingDecision.model;
      }
      if (!hasActiveTurn || activeTurnStalled) {
        const accountUsageBlock = await guardSendAgainstAccountUsage(
          get,
          provider,
          { model: activeModel },
        );
        if (accountUsageBlock) {
          submittedPromptDraft.restore();
          return accountUsageBlock;
        }
      }
      if (autoRoutingDecision && autoRoutingDecision.source !== "disabled") {
        const record = buildAutoRoutingDecisionRecord({
          decision: autoRoutingDecision,
          prompt: promptContent,
        });
        set((current) => ({
          autoRoutingDecisionByTask: {
            ...current.autoRoutingDecisionByTask,
            [resolvedTaskId]: record,
          },
        }));
      }
      const delegatedRuntimeOverrides = resolveDelegatedRuntimeOverrides({
        state,
        overrides: promptDraft.runtimeOverrides,
        provider,
        activeModel,
        prompt: promptContent,
        fileContextCount: resolvedFileContexts.length,
      });

      const skillSelection = resolveSkillSelections({
        text: promptContent,
        skills: state.skillCatalog.skills,
        providerId: provider,
      });
      const normalizedPrompt = skillSelection.normalizedText;

      maybeSuggestUtilityTaskName({
        task: latestWorkspaceSession.tasks.find(
          (candidate) => candidate.id === resolvedTaskId,
        ),
        priorUserTurnCount: latestHistory.filter(
          (message) => message.role === "user",
        ).length,
        prompt: normalizedPrompt || promptContent,
        history: latestHistory,
        lane: resolveAuxLaneRuntime({
          lane: "taskName",
          policy: state.settings.auxiliaryInferencePolicy,
          legacyProviderId: state.settings.utilityInferenceProvider,
          activeProviderId: provider,
        }),
        context: buildUtilityInferenceContext({
          cwd: workspaceCwd,
          provider,
          model: activeModel,
          settings: state.settings,
          lane: "taskName",
        }),
        onTitle: (title) =>
          get().renameTask({
            taskId: resolvedTaskId,
            title,
            source: "auto",
          }),
      });

      const providerSession =
        latestWorkspaceSession.providerSessionByTask[resolvedTaskId];
      const providerSessionCursor = getProviderSessionCursor({
        sessions: providerSession,
        providerId: provider,
      });
      const taskWorkspaceSummary =
        state.workspaces.find(
          (workspace) => workspace.id === taskWorkspaceId,
        ) ?? null;
      const taskWorkspaceTasks = latestWorkspaceSession.tasks;
      let taskWorkspaceInformation =
        latestWorkspaceSession.workspaceInformation;

      // ── Information panel auto-fill ───────────────────────────────────────
      // Detect registerable resources (Jira/PR/Confluence/Figma/Slack/
      // Storybook/Amplify URLs) in the submitted prompt and register them
      // before the turn context is built, so this turn's injected context
      // already includes them. Dedup is keyed on canonical identity (e.g.
      // Jira issue key), not the raw URL, so re-sent links are no-ops.
      if (!state.workspaceDefaultById[taskWorkspaceId]) {
        const detectedPromptResources =
          detectWorkspaceResourcesInText(promptContent);
        if (detectedPromptResources.length > 0) {
          const autofill = applyDetectedWorkspaceResources({
            current: taskWorkspaceInformation,
            detected: detectedPromptResources,
          });
          if (autofill.state !== taskWorkspaceInformation) {
            taskWorkspaceInformation = autofill.state;
            get().applyExternalWorkspaceInformationUpdate({
              workspaceId: taskWorkspaceId,
              workspaceInformation: autofill.state,
            });
            const sessionForPersist = getWorkspaceSessionForState({
              state: get(),
              workspaceId: taskWorkspaceId,
            });
            if (sessionForPersist) {
              persistWorkspaceSessionInBackground({
                workspaceId: taskWorkspaceId,
                session: sessionForPersist,
              });
            }
          }
        }
      }

      // ── PR context staleness gate ──────────────────────────────────────────
      // A PR-context attachment is evidence about one commit. Once the PR
      // head moves, that evidence is withheld from the turn until the user
      // refreshes it in the PR context dialog — an agent acting on a CI log
      // from a superseded commit is worse than one with no log at all.
      const currentWorkspacePr =
        state.workspacePrInfoById[taskWorkspaceId]?.pr ?? null;
      const { fresh: freshSourceContexts } = partitionStalePrContexts({
        parts: task.sourceContexts ?? [],
        currentPrUrl: currentWorkspacePr?.url ?? null,
        currentHeadSha: currentWorkspacePr?.headRefOid ?? null,
      });

      const retrievedContextParts: CanonicalRetrievedContextPart[] = [
        ...buildCurrentTaskAwarenessRetrievedContextParts({
          workspaceId: taskWorkspaceId,
          workspaceName: taskWorkspaceSummary?.name ?? null,
          workspacePath: workspaceCwd ?? null,
          workspaceBranch: state.workspaceBranchById[taskWorkspaceId] ?? null,
          projectName: state.projectName,
          projectPath: state.projectPath,
          taskId: resolvedTaskId,
          tasks: taskWorkspaceTasks,
          workspaceInformation: taskWorkspaceInformation,
        }),
        ...freshSourceContexts,
      ];
      // ── Project memory + child task receipts ───────────────────────────
      // Both are cross-turn state read from main; see project-memory-runtime.
      retrievedContextParts.push(
        ...(await collectTurnStartRetrievedContextParts({
          projectPath: state.projectPath,
          parentTaskId: resolvedTaskId,
          history: latestHistory,
          prompt: normalizedPrompt || promptContent,
        })),
      );
      // `@lens` references resolve against the live Lens browser state.
      let lensReferenceState: LensReferenceState | null = null;
      if (promptDraftReferencesLens(promptDraft)) {
        try {
          const lensStateResult = await window.api?.lens?.getState?.({
            workspaceId: taskWorkspaceId,
          });
          lensReferenceState =
            lensStateResult?.ok && lensStateResult.state
              ? lensStateResult.state
              : null;
        } catch {
          lensReferenceState = null;
        }
      }
      const workspaceInformationReferencesContext =
        buildWorkspaceInformationReferencesRetrievedContext({
          promptDraft,
          workspaceInformation: taskWorkspaceInformation,
          lensState: lensReferenceState,
        });
      if (workspaceInformationReferencesContext) {
        retrievedContextParts.push(workspaceInformationReferencesContext);
      }
      const referencedTaskContext = buildReferencedTaskRetrievedContext({
        prompt: normalizedPrompt || promptContent,
        currentTaskId: resolvedTaskId,
        tasks: taskWorkspaceTasks,
        messagesByTask: latestWorkspaceSession.messagesByTask,
      });
      if (referencedTaskContext) {
        retrievedContextParts.push(referencedTaskContext);
      }
      // ──────────────────────────────────────────────────────────────────────

      const modelRuntimeSettings = applyModelRuntimePreference({
        settings: get().settings,
        providerId: provider,
        model: activeModel,
      });
      const resolvedPromptDraftRuntimeState = applyAutoRoutingPlanMode({
        providerId: provider,
        runtimeOverrides: promptDraft.runtimeOverrides,
        runtimeState: resolvePromptDraftRuntimeState({
          promptDraft,
          fallback: {
            claudePermissionMode: modelRuntimeSettings.claudePermissionMode,
            claudePermissionModeBeforePlan:
              modelRuntimeSettings.claudePermissionModeBeforePlan,
            claudeEffort: modelRuntimeSettings.claudeEffort,
            codexPlanMode: modelRuntimeSettings.codexPlanMode,
            codexReasoningEffort: modelRuntimeSettings.codexReasoningEffort,
            cursorMode: modelRuntimeSettings.cursorMode,
            cursorEffort: modelRuntimeSettings.cursorEffort,
            cursorFastMode: modelRuntimeSettings.cursorFastMode,
            kiroEffort: modelRuntimeSettings.kiroEffort,
          },
        }),
      });
      const providerRuntimeOptions = buildProviderRuntimeOptions({
        provider,
        model: activeModel,
        includeAdvisor: turnOrigin === "conversation",
        advisorRuntimeOverrides: delegatedRuntimeOverrides,
        workerRuntimeOverrides: delegatedRuntimeOverrides,
        settings: {
          ...modelRuntimeSettings,
          ...resolvedPromptDraftRuntimeState,
          codexFastMode:
            resolvedPromptDraftRuntimeState.codexFastMode ??
            modelRuntimeSettings.codexFastMode,
          cursorFastMode:
            resolvedPromptDraftRuntimeState.cursorFastMode ??
            modelRuntimeSettings.cursorFastMode,
          ...(autoRoutingDecision?.claudeEffort
            ? { claudeEffort: autoRoutingDecision.claudeEffort }
            : {}),
          ...(autoRoutingDecision?.codexReasoningEffort
            ? {
                codexReasoningEffort: autoRoutingDecision.codexReasoningEffort,
              }
            : {}),
        },
        boundSecretIds: resolvedPromptDraftRuntimeState.boundSecretIds,
        providerSession,
      });
      const modelInfo = resolveTurnModelInfo({
        providerId: provider,
        runtimeOptions: providerRuntimeOptions,
      });
      const conversation = buildCanonicalConversationRequest({
        turnId,
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
        providerId: provider,
        model: activeModel,
        history: latestHistory,
        userInput: normalizedPrompt,
        mode: "chat",
        fileContexts:
          resolvedFileContexts.length > 0 ? resolvedFileContexts : undefined,
        imageContexts:
          resolvedImageContexts.length > 0 ? resolvedImageContexts : undefined,
        skillContexts: skillSelection.selectedSkills,
        nativeSessionId: providerSessionCursor?.nativeSessionId ?? null,
        syncedThroughMessageId:
          providerSessionCursor?.syncedThroughMessageId ?? null,
        retrievedContextParts,
      });
      const prompt = normalizedPrompt;
      submittedPromptDraft.commit();

      if (taskWorkspaceId === get().activeWorkspaceId) {
        set((nextState) => {
          const pendingTurnState = buildPendingProviderTurnState({
            tasks: nextState.tasks,
            messagesByTask: nextState.messagesByTask,
            messageCountByTask: nextState.messageCountByTask,
            activeTurnIdsByTask: nextState.activeTurnIdsByTask,
            taskWorkspaceIdById: nextState.taskWorkspaceIdById,
            workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
            taskId: resolvedTaskId,
            taskWorkspaceId,
            turnId,
            provider,
            activeModel,
            modelInfo,
            content: promptContent,
            displayContent: promptDisplayContent,
            displayParts: promptDisplayParts,
            fileContexts:
              resolvedFileContexts.length > 0
                ? resolvedFileContexts
                : undefined,
            imageContexts:
              resolvedImageContexts.length > 0
                ? resolvedImageContexts
                : undefined,
            ...(queuedTurnToSend ? { dispatchedFromQueue: true } : {}),
          });

          return {
            ...pendingTurnState,
            promptDraftByTask: {
              ...nextState.promptDraftByTask,
              // Queued-turn dispatch: the composer draft was already
              // preserved (queue trimmed) by the optimistic clear — keep
              // whatever is current instead of clearing it.
              [resolvedTaskId]: draftAfterSend(
                nextState.promptDraftByTask[resolvedTaskId],
              ),
              ...(!preservePromptDraft &&
              sourcePromptDraftTaskId !== resolvedTaskId
                ? {
                    [sourcePromptDraftTaskId]: buildClearedPromptDraft(
                      nextState.promptDraftByTask[sourcePromptDraftTaskId] ??
                        sourcePromptDraft,
                    ),
                  }
                : {}),
            },
          };
        });
      } else {
        set((nextState) => {
          const cachedSession =
            nextState.workspaceRuntimeCacheById[taskWorkspaceId];
          if (!cachedSession) {
            return nextState;
          }

          const pendingTurnState = buildPendingProviderTurnState({
            tasks: cachedSession.tasks,
            messagesByTask: cachedSession.messagesByTask,
            messageCountByTask: cachedSession.messageCountByTask,
            activeTurnIdsByTask: cachedSession.activeTurnIdsByTask,
            taskWorkspaceIdById: nextState.taskWorkspaceIdById,
            workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
            taskId: resolvedTaskId,
            taskWorkspaceId,
            turnId,
            provider,
            activeModel,
            modelInfo,
            content: promptContent,
            displayContent: promptDisplayContent,
            displayParts: promptDisplayParts,
            fileContexts:
              resolvedFileContexts.length > 0
                ? resolvedFileContexts
                : undefined,
            imageContexts:
              resolvedImageContexts.length > 0
                ? resolvedImageContexts
                : undefined,
            ...(queuedTurnToSend ? { dispatchedFromQueue: true } : {}),
          });

          return {
            workspaceRuntimeCacheById: {
              ...nextState.workspaceRuntimeCacheById,
              [taskWorkspaceId]: {
                ...cachedSession,
                tasks: pendingTurnState.tasks,
                messagesByTask: pendingTurnState.messagesByTask,
                messageCountByTask: pendingTurnState.messageCountByTask,
                activeTurnIdsByTask: pendingTurnState.activeTurnIdsByTask,
                promptDraftByTask: {
                  ...cachedSession.promptDraftByTask,
                  [resolvedTaskId]: draftAfterSend(
                    cachedSession.promptDraftByTask[resolvedTaskId],
                  ),
                },
              },
            },
          };
        });

        const inactiveWorkspaceSession =
          get().workspaceRuntimeCacheById[taskWorkspaceId];
        if (inactiveWorkspaceSession) {
          scheduleWorkspaceSnapshotPersist({
            workspaceId: taskWorkspaceId,
            workspaceName: resolveWorkspaceName({
              state: get(),
              workspaceId: taskWorkspaceId,
            }),
            activeTaskId: inactiveWorkspaceSession.activeTaskId,
            tasks: inactiveWorkspaceSession.tasks,
            messagesByTask: inactiveWorkspaceSession.messagesByTask,
            promptDraftByTask: inactiveWorkspaceSession.promptDraftByTask,
            reviewCommentsByTask: inactiveWorkspaceSession.reviewCommentsByTask,
            workspaceInformation: inactiveWorkspaceSession.workspaceInformation,
            editorTabs: inactiveWorkspaceSession.editorTabs,
            activeEditorTabId: inactiveWorkspaceSession.activeEditorTabId,
            terminalTabs: inactiveWorkspaceSession.terminalTabs,
            activeTerminalTabId: inactiveWorkspaceSession.activeTerminalTabId,
            terminalDocked: inactiveWorkspaceSession.terminalDocked,
            cliSessionTabs: inactiveWorkspaceSession.cliSessionTabs,
            activeCliSessionTabId:
              inactiveWorkspaceSession.activeCliSessionTabId,
            activeSurface: inactiveWorkspaceSession.activeSurface,
            openTaskTabIds: inactiveWorkspaceSession.openTaskTabIds,
            lensTabs: inactiveWorkspaceSession.lensTabs,
            paneTabMeta: inactiveWorkspaceSession.paneTabMeta,
            dockLayout: inactiveWorkspaceSession.dockLayout,
            providerSessionByTask:
              inactiveWorkspaceSession.providerSessionByTask,
          });
        }
      }

      const turnActivityStartedAt = Date.now();
      // The usage meter's cadence is driven by real turn activity rather
      // than a wall clock, and this is the authoritative "this provider's
      // quota is being spent now" signal.
      noteRateLimitsProviderActivity(provider, turnActivityStartedAt);
      set((nextState) => ({
        providerTurnActivityByTask: startProviderTurnActivity({
          activityByTask: nextState.providerTurnActivityByTask,
          taskId: resolvedTaskId,
          turnId,
          providerId: provider,
          now: turnActivityStartedAt,
        }),
      }));
      scheduleProviderTurnStallTimer({
        taskId: resolvedTaskId,
        turnId,
        lastEventAt: turnActivityStartedAt,
      });

      let lastPersistedPlanTextForTurn: string | null = null;
      const webFetchAuthWallTracker = createWebFetchAuthWallTracker({
        prompt,
        turnOrigin,
        runtimeOptions: providerRuntimeOptions,
        runtimeOverrides: promptDraft.runtimeOverrides,
      });
      const providerTurnEventController = createProviderTurnEventController({
        onEventArrived: () => {
          // Keeps a long-running turn inside the active usage tier
          // without a store write; the policy only re-arms its loop on
          // the quiet-to-active transition.
          noteRateLimitsProviderActivity(provider);
          reportProviderTurnLiveness({
            taskId: resolvedTaskId,
            turnId,
          });
        },
        flushEvents: (pendingEvents) => {
          webFetchAuthWallTracker.observe(pendingEvents);
          if (eventsIndicateFileEdits(pendingEvents)) {
            recordTurnFileEdits(turnId);
          }
          let persistInactiveWorkspaceSession: {
            workspaceId: string;
            session: WorkspaceSessionState;
          } | null = null;
          let updatedSession: WorkspaceSessionState | null = null;
          const currentState = get();
          const applied = applyPendingProviderEventsToStoreState({
            state: currentState,
            taskWorkspaceId,
            taskId: resolvedTaskId,
            events: pendingEvents,
            provider,
            model: activeModel,
            turnId,
          });
          // Resolve the turn against the task's owning workspace
          // session (runtime cache when inactive) — `state.activeTurnIdsByTask`
          // only reflects the active workspace, so checking it directly
          // froze activity updates and disarmed stall detection for
          // turns running in a backgrounded workspace.
          const owningTurnSession = getWorkspaceSessionForState({
            state: currentState,
            workspaceId: taskWorkspaceId,
          });
          const turnStillActive =
            owningTurnSession?.activeTurnIdsByTask[resolvedTaskId] === turnId;
          const turnActivityPatch = turnStillActive
            ? buildTurnActivityFlushPatch({
                activityByTask: currentState.providerTurnActivityByTask,
                retainedByTask: currentState.retainedTurnActivityByTask,
                taskId: resolvedTaskId,
                turnId,
                providerId: provider,
                events: pendingEvents,
              })
            : null;
          const nextTurnActivityByTask =
            turnActivityPatch?.providerTurnActivityByTask ??
            currentState.providerTurnActivityByTask;
          // Advisor phases are folded even for a turn that is no longer
          // the active one: the terminal phase is what explains why the
          // turn ended, and dropping it would hide advisor aborts.
          const advisorPatch = buildAdvisorExchangePatch({
            exchangeByTask: currentState.advisorExchangeByTask,
            logByTask: currentState.advisorConsultLogByTask,
            taskId: resolvedTaskId,
            turnId,
            events: pendingEvents,
          });
          persistInactiveWorkspaceSession =
            applied.persistInactiveWorkspaceSession;
          updatedSession = applied.updatedSession;
          if (applied.stateChanged || turnActivityPatch || advisorPatch) {
            set({
              ...applied.statePatch,
              ...turnActivityPatch,
              ...advisorPatch,
            });
          }
          if (
            !turnStillActive ||
            pendingEvents.some((event) => event.type === "done")
          ) {
            clearProviderTurnStallTimer(resolvedTaskId);
          } else {
            const nextActivity = nextTurnActivityByTask[resolvedTaskId];
            if (nextActivity) {
              scheduleProviderTurnStallTimer({
                taskId: resolvedTaskId,
                turnId,
                lastEventAt: nextActivity.lastEventAt,
              });
            }
          }
          const persistedInactiveWorkspaceSession =
            persistInactiveWorkspaceSession as {
              workspaceId: string;
              session: WorkspaceSessionState;
            } | null;
          const latestState = get();
          if (persistedInactiveWorkspaceSession !== null) {
            scheduleWorkspaceSnapshotPersist({
              workspaceId: persistedInactiveWorkspaceSession.workspaceId,
              workspaceName: resolveWorkspaceName({
                state: latestState,
                workspaceId: persistedInactiveWorkspaceSession.workspaceId,
              }),
              activeTaskId:
                persistedInactiveWorkspaceSession.session.activeTaskId,
              tasks: persistedInactiveWorkspaceSession.session.tasks,
              messagesByTask:
                persistedInactiveWorkspaceSession.session.messagesByTask,
              promptDraftByTask:
                persistedInactiveWorkspaceSession.session.promptDraftByTask,
              reviewCommentsByTask:
                persistedInactiveWorkspaceSession.session.reviewCommentsByTask,
              workspaceInformation:
                persistedInactiveWorkspaceSession.session.workspaceInformation,
              editorTabs: persistedInactiveWorkspaceSession.session.editorTabs,
              activeEditorTabId:
                persistedInactiveWorkspaceSession.session.activeEditorTabId,
              terminalTabs:
                persistedInactiveWorkspaceSession.session.terminalTabs,
              activeTerminalTabId:
                persistedInactiveWorkspaceSession.session.activeTerminalTabId,
              terminalDocked:
                persistedInactiveWorkspaceSession.session.terminalDocked,
              cliSessionTabs:
                persistedInactiveWorkspaceSession.session.cliSessionTabs,
              activeCliSessionTabId:
                persistedInactiveWorkspaceSession.session.activeCliSessionTabId,
              activeSurface:
                persistedInactiveWorkspaceSession.session.activeSurface,
              openTaskTabIds:
                persistedInactiveWorkspaceSession.session.openTaskTabIds,
              lensTabs: persistedInactiveWorkspaceSession.session.lensTabs,
              paneTabMeta:
                persistedInactiveWorkspaceSession.session.paneTabMeta,
              dockLayout: persistedInactiveWorkspaceSession.session.dockLayout,
              providerSessionByTask:
                persistedInactiveWorkspaceSession.session.providerSessionByTask,
            });
          }
          const nextPlanReady = pendingEvents
            .filter(
              (
                event,
              ): event is Extract<
                NormalizedProviderEvent,
                { type: "plan_ready" }
              > => event.type === "plan_ready",
            )
            .at(-1);
          const planTextToPersist = resolveWorkspacePlanPersistenceText({
            planText: nextPlanReady?.planText,
            lastPersistedPlanText: lastPersistedPlanTextForTurn,
          });
          if (planTextToPersist && workspaceCwd) {
            lastPersistedPlanTextForTurn = planTextToPersist;
            void persistWorkspacePlanFile({
              rootPath: workspaceCwd,
              taskId: resolvedTaskId,
              planText: planTextToPersist,
            }).then((filePath) => {
              if (filePath) {
                latestState.notifyWorkspacePlansChanged();
              }
            });
          }
          const notificationSession =
            updatedSession as WorkspaceSessionState | null;
          let notificationWrites: Promise<unknown> = Promise.resolve();
          if (notificationSession) {
            const notificationsToPersist = buildApprovalNotificationInputs({
              state: latestState,
              session: notificationSession,
              workspaceId: taskWorkspaceId,
              taskId: resolvedTaskId,
              turnId,
              provider,
              events: pendingEvents,
              trustedTools: latestState.settings.trustedTools,
            });
            notificationsToPersist.push(
              ...buildUserInputNotificationInputs({
                state: latestState,
                session: notificationSession,
                workspaceId: taskWorkspaceId,
                taskId: resolvedTaskId,
                turnId,
                provider,
                events: pendingEvents,
              }),
            );
            const failureNotification = buildTaskTurnFailedNotificationInput({
              state: latestState,
              session: notificationSession,
              workspaceId: taskWorkspaceId,
              taskId: resolvedTaskId,
              turnId,
              provider,
              events: pendingEvents,
            });
            if (failureNotification) {
              notificationsToPersist.push(failureNotification);
            } else {
              const completionNotification =
                buildTaskTurnCompletedNotificationInput({
                  state: latestState,
                  session: notificationSession,
                  workspaceId: taskWorkspaceId,
                  taskId: resolvedTaskId,
                  turnId,
                  provider,
                  events: pendingEvents,
                });
              if (completionNotification) {
                notificationsToPersist.push(completionNotification);
              }
            }
            if (notificationsToPersist.length > 0) {
              notificationWrites = persistNotifications(notificationsToPersist);
            }
            const trustedApprovalResponses = findTrustedApprovalResponses({
              session: notificationSession,
              taskId: resolvedTaskId,
              events: pendingEvents,
              trustedTools: latestState.settings.trustedTools,
            });
            for (const response of trustedApprovalResponses) {
              void latestState.resolveApproval({
                taskId: resolvedTaskId,
                messageId: response.messageId,
                approved: true,
              });
            }
          }
          // Keep durable interaction needs aligned with the task
          // window: requests answered elsewhere (managed host, trusted
          // auto-approval) stop being actionable right away, and a turn
          // that ended can no longer accept an answer at all.
          void notificationWrites.then(() => {
            // Read the session again: a trusted auto-approval may have
            // answered the request while the notification was still
            // being written.
            const settled =
              getWorkspaceSessionForState({
                state: get(),
                workspaceId: taskWorkspaceId,
              }) ?? notificationSession;
            attentionSync.syncTaskInteractions({
              taskId: resolvedTaskId,
              messages: settled?.messagesByTask[resolvedTaskId] ?? [],
              endedTurnId: applied.turnCompleted ? turnId : undefined,
            });
          });
          if (applied.turnCompleted) {
            // A finished turn is the one moment the provider's usage is
            // known to have changed, so this — not a timer — is what
            // makes the meter correct. The host-side per-provider cache
            // floor debounces bursts of short turns into one read.
            noteRateLimitsProviderActivity(provider);
            void get()
              .refreshRateLimits({ providers: [provider] })
              .catch(() => undefined);
            const compareOutcome = resolveCompareTurnOutcome(pendingEvents);
            set((state) => {
              const compareRunsById = finishCompareRunsForTask({
                runsById: state.compareRunsById,
                taskId: resolvedTaskId,
                outcome: compareOutcome.status,
                error:
                  compareOutcome.status === "completed"
                    ? undefined
                    : compareOutcome.error,
                now: buildRecentTimestamp(),
              });
              return compareRunsById === state.compareRunsById
                ? state
                : { compareRunsById };
            });
            void launchReadyCompareJudgesFromStore(get, set);
            const latestWorkspaceSession = getWorkspaceSessionForState({
              state: latestState,
              workspaceId: taskWorkspaceId,
            });
            dispatchNextQueuedTaskTurn({
              workspaceId: taskWorkspaceId,
              taskId: resolvedTaskId,
            });
            maybeStartProviderBrowserFallbackTurn(get, {
              taskId: resolvedTaskId,
              events: pendingEvents,
              tracker: webFetchAuthWallTracker,
              session: latestWorkspaceSession,
            });
            const completedTask =
              latestWorkspaceSession?.tasks.find(
                (task) => task.id === resolvedTaskId,
              ) ??
              latestState.tasks.find((task) => task.id === resolvedTaskId) ??
              null;
            runScriptHookInBackground({
              workspaceId: taskWorkspaceId,
              trigger: "turn.completed",
              taskId: resolvedTaskId,
              taskTitle: completedTask?.title,
              turnId,
            });
            generateWorkspaceTurnSummaryInBackground({
              workspaceId: taskWorkspaceId,
              taskId: resolvedTaskId,
              turnId,
            });
          }
        },
      });

      runScriptHookInBackground({
        workspaceId: taskWorkspaceId,
        trigger: "turn.started",
        taskId: resolvedTaskId,
        taskTitle: task?.title,
        turnId,
      });

      if (autoRoutingDecision && autoRoutingDecision.source !== "disabled") {
        const modelResolution = buildAutoRoutingModelResolution({
          decision: autoRoutingDecision,
          provider,
          model: activeModel,
        });
        providerTurnEventController.handleEvent({
          type: "model_resolved",
          resolvedProviderId: provider,
          resolvedModel: activeModel,
          ...(modelResolution ? { modelResolution } : {}),
        });
      }

      runProviderTurn({
        turnId,
        provider,
        prompt,
        conversation,
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
        cwd: workspaceCwd,
        runtimeOptions: applyProjectBasePromptToRuntimeOptions({
          runtimeOptions: providerRuntimeOptions,
          projectBasePrompt: resolveProjectBasePrompt({
            projectPath: get().projectPath,
            recentProjects: get().recentProjects,
          }),
        }),
        onEvent: ({ event }) => providerTurnEventController.handleEvent(event),
      });
      return {
        status: "started",
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
        turnId,
      } satisfies SendUserMessageResult;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        submittedPromptDraft.restore();
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      if (
        queuedTurnToSend ||
        turnOrigin !== "conversation" ||
        submittedPromptDraft.isCommitted()
      ) {
        // None of these can be recovered from a failed bubble: a queued
        // item returns to the queue untouched, a utility turn is not the
        // task's dialogue and has its own error surface, and a committed
        // turn already left the app.
        submittedPromptDraft.restore();
        throw error;
      }
      return parkFailedOutgoingSend({
        set,
        taskId: resolvedTaskId,
        workspaceId: taskWorkspaceId,
        draft: promptDraft,
        error,
      });
    }
  };
}
