import type { ProviderDecisionResponse } from "@/lib/providers/provider.types";
import { buildQuestionReply } from "@/lib/question-reply";
import { runQuestionStage } from "@/lib/agent-runs/persistent-question";
import { canAnswerUserInputWithoutTurn } from "@/lib/notifications/interaction-policy";
import { cancelPendingAutoRouting } from "./auto-routing-dispatch";
import { cancelAgentRunBeforeStop } from "./agent-run-send";
import type { StoreApi } from "zustand";
import {
  applyDelegatedTasksToProviderTurnActivity,
  clearProviderTurnActivity,
  markProviderTurnInteractionResolved,
  retainRetiredTurnActivity,
} from "@/lib/providers/turn-status";
import { i18n } from "@/i18n/runtime";
import { formatAsyncQuestionAnswer } from "@/lib/async-question-answer";
import { pendingDelegatedQuestionAnswer, sendDelegatedQuestionFollowUp } from "@/lib/runs/delegated-question-follow-up";
import { isTaskManaged } from "@/lib/tasks";
import {
  approvalInteractionId,
  userInputInteractionId,
} from "@/lib/work-graph/work-graph-reducer";
import type { AppState, InteractionAnswerOutcome } from "@/store/app-store.types";
import {
  buildMessageId,
  buildRecentTimestamp,
} from "@/store/chat-state-helpers";
import { applyApprovalState, applyUserInputState } from "@/store/editor.utils";
import { buildApprovalResolution } from "@/lib/approvals/approval-resolution";
import { addTrustedToolEntry } from "@/lib/providers/trusted-tools";
import {
  buildManagedTaskTurnInterruptionPatch,
  requestManagedTaskStop,
} from "@/store/managed-task-takeover";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  interruptPendingToolInteractionsInMessages,
  remainingPendingInteraction,
} from "@/store/provider-message.utils";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import { reconcileStopOfFinishedTurn } from "@/store/stopped-turn-reconcile";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type {
  ApprovalPart,
  ChatMessage,
  Task,
  UserInputPart,
} from "@/types/chat";

const pendingAsyncAnswers = new Set<string>();

/**
 * Answers on their way to a provider or host, by `taskId:requestId`. A second
 * answer to the same request while the first is in flight — a double click,
 * the keyboard and a button, a Fleet row and the task — is dropped instead of
 * sent twice; the entry clears when the delivery settles either way.
 */
const inFlightInteractionAnswers = new Set<string>();

function claimInteractionAnswer(taskId: string, requestId: string) {
  const key = `${taskId}:${requestId}`;
  if (inFlightInteractionAnswers.has(key)) {
    return null;
  }
  inFlightInteractionAnswers.add(key);
  return () => {
    inFlightInteractionAnswers.delete(key);
  };
}

type ProviderInteractionActionKey =
  | "abortTaskTurn"
  | "resolveApproval"
  | "resolveUserInput"
  | "syncDelegatedTasksIntoTurnGraph";

type ProviderInteractionActions = Pick<AppState, ProviderInteractionActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

interface TaskRuntimeTarget {
  workspaceId: string;
  isActiveWorkspace: boolean;
  session: WorkspaceSessionState;
  task: Task;
}

export function createProviderInteractionActions(args: {
  set: StoreSet;
  get: StoreGet;
  flushPersistence?: () => boolean;
  clearProviderTurnStallTimer: (taskId: string) => void;
  scheduleProviderTurnStallTimer: (args: {
    taskId: string;
    turnId: string;
    lastEventAt: number;
  }) => void;
  attentionSync: NotificationAttentionSync;
  localAbortSystemEventContent: string;
  resolveTaskRuntimeTarget: (args: {
    state: AppState;
    taskId: string;
  }) => TaskRuntimeTarget | null;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
  findTaskById: (state: Pick<AppState, "tasks">, taskId: string) => Task | null;
}): ProviderInteractionActions {
  const {
    set,
    get,
    clearProviderTurnStallTimer,
    scheduleProviderTurnStallTimer,
    attentionSync,
    localAbortSystemEventContent: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
    resolveTaskRuntimeTarget,
    incrementWorkspaceSnapshotVersion,
    findTaskById,
  } = args;

  return {
    syncDelegatedTasksIntoTurnGraph: ({ taskId, children }) => {
      // Computed before `set` rather than inside it: returning the same state
      // from the updater suppresses the subscriber notification but not the
      // persist middleware, which serializes and writes the store on every
      // `set` regardless. This runs on every delegated-task change event and is
      // usually a no-op, so it must not reach `set` at all.
      const providerTurnActivityByTask = applyDelegatedTasksToProviderTurnActivity({
        activityByTask: get().providerTurnActivityByTask,
        taskId,
        children,
      });
      if (
        providerTurnActivityByTask === get().providerTurnActivityByTask
      ) {
        return;
      }
      set({ providerTurnActivityByTask });
    },
    abortTaskTurn: ({ taskId, keepAgentRun, cascade = false, expectedTurnId }) => {
      if (cancelPendingAutoRouting(taskId) && !cascade) return;
      const stateBefore = get();
      // Stop ends the task's agent run too, before the turn, so the run never picks up after it.
      // A run Tars holds is paused through Tars instead (`cancelAgentRunBeforeStop`).
      const runWorkspaceId = stateBefore.taskWorkspaceIdById[taskId] ?? stateBefore.activeWorkspaceId;
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
      const capturedTurnId = runtimeTarget?.session.activeTurnIdsByTask[taskId] ?? null;
      // An owner response belongs to the turn that was present when Stop was pressed.
      if (expectedTurnId !== undefined && capturedTurnId !== expectedTurnId) return Promise.resolve(false);
      if (cascade && !keepAgentRun) {
        let hasRun = false;
        const settled = new Promise<boolean>((resolve) => {
          hasRun = cancelAgentRunBeforeStop({ workspaceId: runWorkspaceId, taskId,
            turnId: runtimeTarget?.session.activeTurnIdsByTask[taskId] ?? null,
            stopTurn: (cascadeAllowed) => { Promise.resolve(get().abortTaskTurn({ taskId, keepAgentRun: true, cascade: cascade && cascadeAllowed, expectedTurnId: capturedTurnId })).then((value) => resolve(value !== false), () => resolve(false)); },
            onSettled: (endTurn) => { if (!endTurn) resolve(false); },
          });
        });
        if (hasRun) return settled;
      }
      const activeTurnId =
        runtimeTarget?.session.activeTurnIdsByTask[taskId];
      const workspaceId =
        runtimeTarget?.workspaceId ??
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      if (
        isTaskManaged(
          runtimeTarget?.task ?? findTaskById(stateBefore, taskId),
        )
      ) {
        return requestManagedTaskStop({ taskId, state: stateBefore }).then(
          (stopped) => {
            if (!stopped) return false;
            clearProviderTurnStallTimer(taskId);
            set((state) =>
              buildManagedTaskTurnInterruptionPatch(state, taskId),
            );
            attentionSync.syncTaskInteractions({
              taskId,
              messages:
                (workspaceId === get().activeWorkspaceId
                  ? get().messagesByTask
                  : get().workspaceRuntimeCacheById[workspaceId]
                      ?.messagesByTask)?.[taskId] ?? [],
              endedTurnId: activeTurnId,
            });
            return true;
          },
        );
      }
      if (activeTurnId) {
        set(state => ({ restartRecovery: { ...state.restartRecovery, stoppedTurnIds: [...new Set([...state.restartRecovery.stoppedTurnIds, activeTurnId])].slice(-10000) } }));
        args.flushPersistence?.();
      }
      const pendingStops: Promise<unknown>[] = [];
      clearProviderTurnStallTimer(taskId);
      const stopRequestedAt = buildRecentTimestamp();
      if (activeTurnId) {
        const abortTurn = window.api?.provider?.abortTurn;
        if (abortTurn) {
          pendingStops.push(abortTurn({ turnId: activeTurnId }));
        }
      }
      // Clean up provider runtime state (thread caches, session maps) so a
      // subsequent turn does not try to resume a stale / aborted thread.
      const cleanupTask = window.api?.provider?.cleanupTask;
      if (cleanupTask) {
        pendingStops.push(cleanupTask({ taskId }));
      }

      set((state) => {
        const cachedSession =
          workspaceId && workspaceId !== state.activeWorkspaceId
            ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
            : null;
        const messagesByTask =
          cachedSession?.messagesByTask ?? state.messagesByTask;
        const activeTurnIdsByTask =
          cachedSession?.activeTurnIdsByTask ?? state.activeTurnIdsByTask;
        const providerSessionByTask =
          cachedSession?.providerSessionByTask ?? state.providerSessionByTask;
        const providerGoalByTask =
          cachedSession?.providerGoalByTask ?? state.providerGoalByTask;
        const current = messagesByTask[taskId] ?? [];
        const interruptedMessages = interruptPendingToolInteractionsInMessages({
          messages: current,
          stopped: true,
        });
        const target = interruptedMessages[interruptedMessages.length - 1];
        // Clear persisted provider session so stale thread IDs are not
        // carried across to subsequent turns or workspace reloads.
        const { [taskId]: _dropped, ...restProviderSession } =
          providerSessionByTask;
        const { [taskId]: _droppedGoal, ...restProviderGoal } =
          providerGoalByTask;
        const nextMessages =
          !target || target.role !== "assistant" || !target.isStreaming
            ? interruptedMessages
            : [
                ...interruptedMessages.slice(0, -1),
                {
                  ...target,
                  completedAt: buildRecentTimestamp(),
                  isStreaming: false,
                  parts: [
                    ...target.parts,
                    {
                      type: "system_event" as const,
                      content: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
                    },
                  ],
                },
              ];
        const sessionPatch = {
          messagesByTask:
            nextMessages === current
              ? messagesByTask
              : {
                  ...messagesByTask,
                  [taskId]: nextMessages,
                },
          activeTurnIdsByTask: {
            ...activeTurnIdsByTask,
            [taskId]: undefined,
          },
            providerSessionByTask: restProviderSession,
            providerGoalByTask: restProviderGoal,
        };
        const providerTurnActivityByTask = clearProviderTurnActivity({
          activityByTask: state.providerTurnActivityByTask,
          taskId,
        });
        // "What was it doing when I stopped it" is the question a stop leaves
        // behind, so the interrupted turn is the one most worth replaying.
        const retainedTurnActivityByTask = retainRetiredTurnActivity({
          retainedByTask: state.retainedTurnActivityByTask,
          previous: state.providerTurnActivityByTask,
          next: providerTurnActivityByTask,
          taskId,
          outcome: "stopped",
        });
        if (cachedSession && workspaceId) {
          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [workspaceId]: {
                ...cachedSession,
                ...sessionPatch,
              },
            },
            providerTurnActivityByTask,
            retainedTurnActivityByTask,
          };
        }
        return {
          ...sessionPatch,
          providerTurnActivityByTask,
          retainedTurnActivityByTask,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
      if (activeTurnId && workspaceId) {
        void reconcileStopOfFinishedTurn({
          get,
          set,
          workspaceId,
          taskId,
          turnId: activeTurnId,
          stopRequestedAt,
        });
      }
      // Stopping the turn interrupts its pending requests, so their durable
      // notifications must stop asking for an answer too.
      attentionSync.syncTaskInteractions({
        taskId,
        messages:
          (workspaceId === get().activeWorkspaceId
            ? get().messagesByTask
            : get().workspaceRuntimeCacheById[workspaceId]?.messagesByTask)?.[
            taskId
          ] ?? [],
        endedTurnId: activeTurnId,
      });
      const stopped = pendingStops.length ? Promise.all(pendingStops).then(() => true, () => false) : undefined;
      const stopChildren = typeof window === "undefined" ? undefined : window.api?.taskControl?.stopChildren;
      if (cascade && stopChildren && workspaceId) {
        // End native parent execution before traversing children; it cannot delegate again.
        return Promise.resolve(stopped).then(async (ok) => {
          if (ok === false) return false;
          const result = await stopChildren({ workspaceId, taskId });
          return result.ok && result.skipped.length === 0;
        }).catch(() => false);
      }
      return stopped;
    },
    resolveApproval: async ({ taskId, messageId, requestId, approved, scope, decidedBy, onUnanswerable = "report" }) => {
      const stateBefore = get();
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
      const task = runtimeTarget?.task ?? findTaskById(stateBefore, taskId);
      const workspaceId =
        runtimeTarget?.workspaceId ??
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const targetSession =
        runtimeTarget?.session ??
        (workspaceId
          ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
          : null);
      const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
      // prettier-ignore
      const respondThroughHost = isTaskManaged(task) || (activeTurnId != null && stateBefore.hostOwnedTurnIdsByTask[taskId] === activeTurnId);
      const message = (targetSession?.messagesByTask[taskId] ?? []).find(
        (item) => item.id === messageId,
      );
      const approvalPart = requestId
        ? message?.parts.find(
            (part): part is ApprovalPart =>
              part.type === "approval" &&
              part.requestId === requestId &&
              part.state === "approval-requested",
          )
        : findLatestPendingApprovalPart({ message });

      const appendApprovalFailure = (failureText: string) => {
        set((state) => {
          const cachedSession =
            workspaceId && workspaceId !== state.activeWorkspaceId
              ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
              : null;
          const current =
            (cachedSession?.messagesByTask ?? state.messagesByTask)[taskId] ??
            [];
          const durableCount =
            (cachedSession?.messageCountByTask ?? state.messageCountByTask)[
              taskId
            ] ?? 0;
          const systemMessage: ChatMessage = {
            id: buildMessageId({
              taskId,
              count: Math.max(current.length, durableCount),
            }),
            role: "assistant",
            model: "system",
            providerId: "user",
            content: failureText,
            parts: [
              {
                type: "system_event",
                content: failureText,
              },
            ],
          };
          if (cachedSession && workspaceId) {
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: {
                    ...cachedSession.messagesByTask,
                    [taskId]: [...current, systemMessage],
                  },
                  messageCountByTask: {
                    ...cachedSession.messageCountByTask,
                    [taskId]: Math.max(
                      (cachedSession.messageCountByTask[taskId] ??
                        current.length) + 1,
                      current.length + 1,
                    ),
                  },
                },
              },
            };
          }
          return {
            messagesByTask: {
              ...state.messagesByTask,
              [taskId]: [...current, systemMessage],
            },
            messageCountByTask: {
              ...state.messageCountByTask,
              [taskId]: Math.max(
                (state.messageCountByTask[taskId] ?? current.length) + 1,
                current.length + 1,
              ),
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      };

      // `interrupted`: the provider can no longer answer, so the request
      // closes unanswered instead of recording a decision nobody received.
      const applyApprovalResponse = (requestId: string, grant?: "always", interrupted?: true) => {
        const resolvedAt = Date.now();
        // Who decided, recorded with the answer: a person, unless a Stave rule answered.
        const resolution = interrupted ? undefined : buildApprovalResolution({
          approved,
          source: decidedBy?.source ?? "user",
          decidedAt: resolvedAt,
          ...(decidedBy ? { reason: decidedBy.reason } : { scope: grant ?? "once" }),
        });
        set((state) => {
          const resolveActivity = (messagesByTask: Record<string, ChatMessage[]>) =>
            activeTurnId
              ? markProviderTurnInteractionResolved({
                  activityByTask: state.providerTurnActivityByTask,
                  taskId,
                  turnId: activeTurnId,
                  now: resolvedAt,
                  interactionId: approvalInteractionId(requestId),
                  remaining: remainingPendingInteraction(messagesByTask[taskId], activeTurnId),
                })
              : state.providerTurnActivityByTask;
          if (workspaceId && workspaceId !== state.activeWorkspaceId) {
            const cachedSession = state.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return state;
            }
            const nextMessagesState = applyApprovalState({
              messagesByTask: cachedSession.messagesByTask,
              workspaceSnapshotVersion: 0,
              taskId,
              messageId,
              requestId,
              approved,
              resolution,
              ...(interrupted ? { interrupted } : {}),
            });
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: nextMessagesState.messagesByTask,
                },
              },
              providerTurnActivityByTask: resolveActivity(nextMessagesState.messagesByTask),
            };
          }

          const nextMessagesState = applyApprovalState({
            messagesByTask: state.messagesByTask,
            workspaceSnapshotVersion: state.workspaceSnapshotVersion,
            taskId,
            messageId,
            requestId,
            approved,
            resolution,
            ...(interrupted ? { interrupted } : {}),
          });
          return {
            ...nextMessagesState,
            providerTurnActivityByTask: resolveActivity(nextMessagesState.messagesByTask),
          };
        });
        if (activeTurnId) {
          scheduleProviderTurnStallTimer({
            taskId,
            turnId: activeTurnId,
            lastEventAt: resolvedAt,
          });
        }
        void attentionSync.settleAnsweredApproval({
          taskId,
          messageId,
          requestId,
        });
      };

      if (!approvalPart) {
        // Already answered, or never pending: nothing left to deliver.
        return { status: "skipped" };
      }
      const fail = (message: string): InteractionAnswerOutcome => {
        appendApprovalFailure(`Approval delivery failed: ${message}`);
        return { status: "failed", message };
      };
      const alreadyAnswering: InteractionAnswerOutcome = {
        status: "failed",
        message: i18n.t("notifications:approvalAnswer.alreadyAnswering"),
      };

      if (activeTurnId && !respondThroughHost) {
        const respondApproval = window.api?.provider?.respondApproval;
        if (respondApproval) {
          const release = claimInteractionAnswer(taskId, approvalPart.requestId);
          if (!release) {
            return alreadyAnswering;
          }
          // Only forward `always` when this request advertised it. A stale
          // caller must not be able to widen an approval the runtime never
          // offered to persist.
          const grant = approved && scope === "always" && approvalPart.supportsAllowAlways ? ("always" as const) : undefined;
          try {
            const result = await respondApproval({
              turnId: activeTurnId,
              requestId: approvalPart.requestId,
              approved,
              ...(grant ? { scope: grant } : {}),
            });
            if (!result.ok) {
              if ((result.unanswerable || result.reason === "already-answered") && onUnanswerable === "close") {
                applyApprovalResponse(approvalPart.requestId, undefined, true);
                return { status: "skipped" };
              }
              return fail(result.message ?? "unknown");
            }
            applyApprovalResponse(approvalPart.requestId, grant);
            // Stave keeps this grant: the entry joins the trusted tools, and
            // every later request it matches is answered from that list.
            if (grant && approvalPart.trustedToolEntry) {
              const settings = get().settings;
              get().updateSettings({
                patch: {
                  trustedTools: addTrustedToolEntry({
                    entries: settings.trustedTools,
                    entry: approvalPart.trustedToolEntry,
                  }),
                },
              });
            }
            return { status: "delivered" };
          } catch (error) {
            return fail(String(error));
          } finally {
            release();
          }
        }
      }

      if (
        (respondThroughHost || !activeTurnId) &&
        workspaceId &&
        window.api?.localMcp?.respondApproval
      ) {
        const release = claimInteractionAnswer(taskId, approvalPart.requestId);
        if (!release) {
          return alreadyAnswering;
        }
        try {
          const result = await window.api.localMcp.respondApproval({
            workspaceId,
            taskId,
            requestId: approvalPart.requestId,
            approved,
            ...(decidedBy ? { decidedBy } : {}),
          });
          if (!result.ok) {
            // The host no longer has this approval waiting: its turn ended or
            // it was answered elsewhere. Retrying cannot deliver it.
            const gone = result.reason === "already-answered" || result.reason === "unknown-request" ||
              result.reason === "request-interrupted";
            if (gone && onUnanswerable === "close") {
              applyApprovalResponse(approvalPart.requestId, undefined, true);
              return { status: "skipped" };
            }
            return fail(result.message ?? "unknown");
          }
          applyApprovalResponse(approvalPart.requestId);
          return { status: "delivered" };
        } catch (error) {
          return fail(String(error));
        } finally {
          release();
        }
      }

      if (!activeTurnId && onUnanswerable === "close") {
        applyApprovalResponse(approvalPart.requestId, undefined, true);
        return { status: "skipped" };
      }
      return fail("no active turn found for this task.");
    },
    resolveUserInput: async ({
      taskId,
      messageId,
      requestId,
      answers,
      denied,
      onUnanswerable = "report",
    }) => {
      const stateBefore = get();
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
      const task = runtimeTarget?.task ?? findTaskById(stateBefore, taskId);
      const workspaceId =
        runtimeTarget?.workspaceId ??
        stateBefore.taskWorkspaceIdById[taskId] ??
        stateBefore.activeWorkspaceId;
      const targetSession =
        runtimeTarget?.session ??
        (workspaceId
          ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
          : null);
      const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
      // prettier-ignore
      const respondThroughHost = isTaskManaged(task) || (activeTurnId != null && stateBefore.hostOwnedTurnIdsByTask[taskId] === activeTurnId);
      const message = (targetSession?.messagesByTask[taskId] ?? []).find(
        (item) => item.id === messageId,
      );
      const userInputPart = requestId
        ? message?.parts.find(
            (part): part is UserInputPart =>
              part.type === "user_input" &&
              part.requestId === requestId &&
              part.state === "input-requested",
          )
        : findLatestPendingUserInputPart({ message });

      const appendUserInputFailure = (failureText: string) => {
        set((state) => {
          const cachedSession =
            workspaceId && workspaceId !== state.activeWorkspaceId
              ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
              : null;
          const current =
            (cachedSession?.messagesByTask ?? state.messagesByTask)[taskId] ??
            [];
          const durableCount =
            (cachedSession?.messageCountByTask ?? state.messageCountByTask)[
              taskId
            ] ?? 0;
          const systemMessage: ChatMessage = {
            id: buildMessageId({
              taskId,
              count: Math.max(current.length, durableCount),
            }),
            role: "assistant",
            model: "system",
            providerId: "user",
            content: failureText,
            parts: [
              {
                type: "system_event",
                content: failureText,
              },
            ],
          };
          if (cachedSession && workspaceId) {
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: {
                    ...cachedSession.messagesByTask,
                    [taskId]: [...current, systemMessage],
                  },
                  messageCountByTask: {
                    ...cachedSession.messageCountByTask,
                    [taskId]: Math.max(
                      (cachedSession.messageCountByTask[taskId] ??
                        current.length) + 1,
                      current.length + 1,
                    ),
                  },
                },
              },
            };
          }
          return {
            messagesByTask: {
              ...state.messagesByTask,
              [taskId]: [...current, systemMessage],
            },
            messageCountByTask: {
              ...state.messageCountByTask,
              [taskId]: Math.max(
                (state.messageCountByTask[taskId] ?? current.length) + 1,
                current.length + 1,
              ),
            },
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          };
        });
      };

      const applyUserInputResponse = (requestId: string, interrupted?: true) => {
        const resolvedAt = Date.now();
        set((state) => {
          const resolveActivity = (messagesByTask: Record<string, ChatMessage[]>) =>
            activeTurnId
              ? markProviderTurnInteractionResolved({
                  activityByTask: state.providerTurnActivityByTask,
                  taskId,
                  turnId: activeTurnId,
                  now: resolvedAt,
                  interactionId: userInputInteractionId(requestId),
                  remaining: remainingPendingInteraction(messagesByTask[taskId], activeTurnId),
                })
              : state.providerTurnActivityByTask;
          if (workspaceId && workspaceId !== state.activeWorkspaceId) {
            const cachedSession = state.workspaceRuntimeCacheById[workspaceId];
            if (!cachedSession) {
              return state;
            }
            const nextMessagesState = applyUserInputState({
              messagesByTask: cachedSession.messagesByTask,
              workspaceSnapshotVersion: 0,
              taskId,
              messageId,
              requestId,
              answers,
              denied,
              interrupted,
            });
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: nextMessagesState.messagesByTask,
                },
              },
              providerTurnActivityByTask: resolveActivity(nextMessagesState.messagesByTask),
            };
          }

          const nextMessagesState = applyUserInputState({
            messagesByTask: state.messagesByTask,
            workspaceSnapshotVersion: state.workspaceSnapshotVersion,
            taskId,
            messageId,
            requestId,
            answers,
            denied,
            interrupted,
          });
          return {
            ...nextMessagesState,
            providerTurnActivityByTask: resolveActivity(nextMessagesState.messagesByTask),
          };
        });
        if (activeTurnId) {
          scheduleProviderTurnStallTimer({
            taskId,
            turnId: activeTurnId,
            lastEventAt: resolvedAt,
          });
        }
        void attentionSync.settleAnsweredUserInput({
          taskId,
          messageId,
          requestId,
        });
      };

      const reportFailure = (message: string, transcriptMessage = message): InteractionAnswerOutcome => {
        appendUserInputFailure(transcriptMessage);
        return { status: "failed", message };
      };
      const fail = (detail: string) => reportFailure(detail,
        i18n.t("session:userInputDelivery.failedWithDetail", { detail }));
      const alreadyAnswering: InteractionAnswerOutcome = {
        status: "failed",
        message: i18n.t("notifications:approvalAnswer.alreadyAnswering"),
      };

      if (userInputPart?.delivery === "async" && runQuestionStage(userInputPart.requestId)) {
        const host = window.api?.localMcp?.respondUserInput;
        if (!host || !workspaceId) return reportFailure(i18n.t("session:userInputDelivery.notAccepted"));
        const key = `${workspaceId}:${taskId}:${userInputPart.requestId}`;
        if (pendingAsyncAnswers.has(key)) return alreadyAnswering;
        pendingAsyncAnswers.add(key);
        try {
          const result = await host({ workspaceId, taskId, requestId: userInputPart.requestId, expectedMessageId: messageId, answers, denied });
          if (!result.ok) return reportFailure(i18n.t("agentRuns:persistentQuestion.deliveryFailed", { reason: result.message ?? "unknown" }));
          applyUserInputResponse(userInputPart.requestId);
          return { status: "delivered" };
        } catch (error) {
          return reportFailure(i18n.t("agentRuns:persistentQuestion.deliveryFailed", { reason: String(error) }));
        } finally {
          pendingAsyncAnswers.delete(key);
        }
      }
      if (userInputPart?.delivery === "async") {
        // An async question did not pause the provider and has no pending
        // request to resolve. Its answer is an ordinary user message: steered
        // into the running turn when there is one, otherwise sent (or queued)
        // as the next turn.
        // Only the task's controller sends messages to a managed task. A
        // delegated child's controller is its parent's delegation, which is
        // the only path that can carry this answer.
        const parentTaskId = isTaskManaged(task) ? task?.parentTaskId?.trim() : undefined;
        if (isTaskManaged(task) && !parentTaskId) {
          return reportFailure(i18n.t("notifications:asyncQuestionAnswer.managedTask"));
        }
        const key = `${taskId}:${userInputPart.requestId}`;
        if (pendingAsyncAnswers.has(key)) return alreadyAnswering;
        // An earlier answer to this question went to the child and is not
        // confirmed yet. Answering again waits on that turn, so it is the
        // earlier answer that gets recorded: it is what the child received.
        const earlier = parentTaskId
          ? pendingDelegatedQuestionAnswer<{ answers?: Record<string, string>; denied?: boolean }>(key)
          : undefined;
        if (earlier && (earlier.denied !== denied || JSON.stringify(earlier.answers ?? null) !== JSON.stringify(answers ?? null))) {
          const outcome = await get().resolveUserInput({ taskId, messageId, requestId, answers: earlier.answers, denied: earlier.denied, onUnanswerable });
          // Says so to whoever answered: their answer is not the one delivered.
          return outcome.status === "delivered" ? { status: "delivered", earlierAnswer: true } : outcome;
        }
        pendingAsyncAnswers.add(key);
        const asyncRequestId = userInputPart.requestId;
        const content = formatAsyncQuestionAnswer({
          questions: userInputPart.questions,
          answers,
          denied,
        });
        const send = (submitIntent: "steer" | "queue") =>
          get().sendUserMessage({
            taskId,
            content,
            questionReply: buildQuestionReply({ requestId: asyncRequestId, sourceMessageId: messageId,
              questions: userInputPart.questions, answers, denied }),
            turnOrigin: "conversation",
            preservePromptDraft: true,
            submitIntent,
          });
        const recordAnswer = async (hostOwned: boolean) => {
          applyUserInputResponse(asyncRequestId);
          // Only a host-owned transcript needs the host's copy updated; a
          // renderer-owned one is persisted from the state applied above.
          const host = window.api?.localMcp?.respondUserInput;
          if (!hostOwned || !workspaceId || !host) return;
          const result = await host({
            workspaceId,
            taskId,
            requestId: asyncRequestId,
            expectedMessageId: messageId,
            answers,
            denied,
            answerDelivered: true,
          });
          if (!result.ok) {
            console.warn("[user-input] host did not record the async answer", {
              taskId,
              requestId: asyncRequestId,
              message: result.message,
            });
          }
        };
        if (parentTaskId) {
          try {
            const followUp = await sendDelegatedQuestionFollowUp({
              parentTaskId,
              taskId,
              prompt: content,
              attemptKey: key,
              answer: { answers, denied },
              accounts: get().settings,
            });
            // The question did not pause the child, so a decline that no
            // delegation can carry still ends it: nothing waits on the answer.
            if (followUp.status === "sent" || (denied && followUp.status === "closed")) {
              await recordAnswer(true);
              return { status: "delivered" };
            }
            if (followUp.status === "closed") {
              return {
                ...reportFailure(i18n.t("notifications:asyncQuestionAnswer.delegationClosed")),
                unanswerable: true,
              };
            }
            // The answer is not recorded until the child's turn started with it,
            // so the question stays open for another answer.
            if (followUp.status === "not-started") {
              return reportFailure(followUp.message
                ? i18n.t("notifications:asyncQuestionAnswer.delegationNotStarted", { detail: followUp.message })
                : i18n.t("notifications:asyncQuestionAnswer.delegationNotStartedUnknown"));
            }
            if (followUp.status === "unconfirmed") {
              return reportFailure(i18n.t("notifications:asyncQuestionAnswer.delegationUnconfirmed"));
            }
            return reportFailure(followUp.status === "running"
              ? i18n.t("notifications:asyncQuestionAnswer.delegationRunning")
              : i18n.t("notifications:asyncQuestionAnswer.delegationRefused", { detail: followUp.message }));
          } catch (error) {
            return fail(String(error));
          } finally {
            pendingAsyncAnswers.delete(key);
          }
        }
        try {
          let result = await send(activeTurnId ? "steer" : "queue");
          // Steering is off or was refused: wait for the turn instead.
          if (result.status === "steer-unavailable") result = await send("queue");
          if (result.status === "steer-delivery-unknown") {
            // The provider may still accept it; resending could answer twice.
            await recordAnswer(respondThroughHost);
            return reportFailure(i18n.t("notifications:asyncQuestionAnswer.deliveryUnconfirmed"));
          }
          if (
            result.status === "started" ||
            result.status === "steered" ||
            result.status === "queued" ||
            result.status === "run-started"
          ) {
            // An answer that starts an agent run hands the transcript to the host.
            await recordAnswer(respondThroughHost || result.status === "run-started");
            return { status: "delivered" };
          }
          return "message" in result && result.message
            ? fail(result.message)
            : reportFailure(i18n.t("session:userInputDelivery.notAccepted"));
        } catch (error) {
          return fail(String(error));
        } finally {
          pendingAsyncAnswers.delete(key);
        }
      }

      if (!userInputPart) return { status: "skipped" };

      const deliver = async (
        send: () => Promise<ProviderDecisionResponse>,
      ): Promise<InteractionAnswerOutcome> => {
        const release = claimInteractionAnswer(taskId, userInputPart.requestId);
        if (!release) return alreadyAnswering;
        try {
          const result = await send();
          if (!result.ok) {
            // A Run question can move to a follow-up turn after its live
            // responder goes away. Keep it available during that transition.
            const expired = !canAnswerUserInputWithoutTurn(userInputPart) && (
              result.unanswerable || result.reason === "unknown-request" || result.reason === "request-interrupted"
            );
            if (onUnanswerable === "close" && (result.reason === "already-answered" || expired)) {
              applyUserInputResponse(userInputPart.requestId, true);
              return { status: "skipped" };
            }
            return fail(result.message ?? "unknown");
          }
          applyUserInputResponse(userInputPart.requestId);
          return { status: "delivered" };
        } catch (error) {
          return fail(String(error));
        } finally {
          release();
        }
      };

      const response = { requestId: userInputPart.requestId, answers, denied };
      const respondUserInput = window.api?.provider?.respondUserInput;
      if (activeTurnId && !respondThroughHost && respondUserInput) {
        return deliver(() => respondUserInput({ ...response, turnId: activeTurnId }));
      }
      const respondThroughLocalMcp = window.api?.localMcp?.respondUserInput;
      if ((respondThroughHost || !activeTurnId) && workspaceId && respondThroughLocalMcp) {
        return deliver(() => respondThroughLocalMcp({ ...response, workspaceId, taskId, expectedMessageId: messageId }));
      }
      return fail("no active turn found for this task.");
    },
  };
}
