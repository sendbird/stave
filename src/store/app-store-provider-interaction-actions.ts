import type { StoreApi } from "zustand";
import {
  clearProviderTurnActivity,
  markProviderTurnInteractionResolved,
} from "@/lib/providers/turn-status";
import { isTaskManaged } from "@/lib/tasks";
import type { AppState } from "@/store/app-store.types";
import {
  buildMessageId,
  buildRecentTimestamp,
} from "@/store/chat-state-helpers";
import { applyApprovalState, applyUserInputState } from "@/store/editor.utils";
import {
  buildManagedTaskTurnInterruptionPatch,
  requestManagedTaskStop,
} from "@/store/managed-task-takeover";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  interruptPendingToolInteractionsInMessages,
} from "@/store/provider-message.utils";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type {
  ApprovalPart,
  ChatMessage,
  Task,
  UserInputPart,
} from "@/types/chat";

type ProviderInteractionActionKey =
  "abortTaskTurn" | "resolveApproval" | "resolveUserInput";

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
    abortTaskTurn: ({ taskId }) => {
      const stateBefore = get();
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
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
        void requestManagedTaskStop({ taskId, state: stateBefore }).then(
          (stopped) => {
            if (!stopped) {
              return;
            }
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
          },
        );
        return;
      }
      clearProviderTurnStallTimer(taskId);
      if (activeTurnId) {
        const abortTurn = window.api?.provider?.abortTurn;
        if (abortTurn) {
          void abortTurn({ turnId: activeTurnId });
        }
      }
      // Clean up provider runtime state (thread caches, session maps) so a
      // subsequent turn does not try to resume a stale / aborted thread.
      const cleanupTask = window.api?.provider?.cleanupTask;
      if (cleanupTask) {
        void cleanupTask({ taskId });
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
          };
        }
        return {
          ...sessionPatch,
          providerTurnActivityByTask,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
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
    },
    resolveApproval: ({ taskId, messageId, requestId, approved }) => {
      const stateBefore = get();
      const task = findTaskById(stateBefore, taskId);
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
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

      const applyApprovalResponse = (requestId: string) => {
        const resolvedAt = Date.now();
        set((state) => {
          const nextProviderTurnActivityByTask = activeTurnId
            ? markProviderTurnInteractionResolved({
                activityByTask: state.providerTurnActivityByTask,
                taskId,
                turnId: activeTurnId,
                now: resolvedAt,
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
            });
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: nextMessagesState.messagesByTask,
                },
              },
              providerTurnActivityByTask: nextProviderTurnActivityByTask,
            };
          }

          return {
            ...applyApprovalState({
              messagesByTask: state.messagesByTask,
              workspaceSnapshotVersion: state.workspaceSnapshotVersion,
              taskId,
              messageId,
              requestId,
              approved,
            }),
            providerTurnActivityByTask: nextProviderTurnActivityByTask,
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

      if (activeTurnId && approvalPart && !respondThroughHost) {
        const respondApproval = window.api?.provider?.respondApproval;
        if (respondApproval) {
          void respondApproval({
            turnId: activeTurnId,
            requestId: approvalPart.requestId,
            approved,
          })
            .then((result) => {
              if (!result.ok) {
                appendApprovalFailure(
                  `Approval delivery failed: ${result.message ?? "unknown"}`,
                );
                return;
              }
              applyApprovalResponse(approvalPart.requestId);
            })
            .catch((error) => {
              appendApprovalFailure(
                `Approval delivery failed: ${String(error)}`,
              );
            });
          return;
        }
      }

      if (
        (respondThroughHost || !activeTurnId) &&
        approvalPart &&
        workspaceId &&
        window.api?.localMcp?.respondApproval
      ) {
        void window.api.localMcp
          .respondApproval({
            workspaceId,
            taskId,
            requestId: approvalPart.requestId,
            approved,
          })
          .then((result) => {
            if (!result.ok) {
              appendApprovalFailure(
                `Approval delivery failed: ${result.message ?? "unknown"}`,
              );
              return;
            }
            applyApprovalResponse(approvalPart.requestId);
          })
          .catch((error) => {
            appendApprovalFailure(`Approval delivery failed: ${String(error)}`);
          });
        return;
      }

      if (
        !activeTurnId &&
        approvalPart &&
        window.api?.provider?.respondApproval
      ) {
        appendApprovalFailure(
          "Approval delivery failed: no active turn found for this task.",
        );
        return;
      }
      if (approvalPart) {
        appendApprovalFailure(
          "Approval delivery failed: no active turn found for this task.",
        );
        return;
      }
    },
    resolveUserInput: ({
      taskId,
      messageId,
      requestId,
      answers,
      denied,
    }) => {
      const stateBefore = get();
      const task = findTaskById(stateBefore, taskId);
      const runtimeTarget = resolveTaskRuntimeTarget({
        state: stateBefore,
        taskId,
      });
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

      const applyUserInputResponse = (requestId: string) => {
        const resolvedAt = Date.now();
        set((state) => {
          const nextProviderTurnActivityByTask = activeTurnId
            ? markProviderTurnInteractionResolved({
                activityByTask: state.providerTurnActivityByTask,
                taskId,
                turnId: activeTurnId,
                now: resolvedAt,
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
            });
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: {
                  ...cachedSession,
                  messagesByTask: nextMessagesState.messagesByTask,
                },
              },
              providerTurnActivityByTask: nextProviderTurnActivityByTask,
            };
          }

          return {
            ...applyUserInputState({
              messagesByTask: state.messagesByTask,
              workspaceSnapshotVersion: state.workspaceSnapshotVersion,
              taskId,
              messageId,
              requestId,
              answers,
              denied,
            }),
            providerTurnActivityByTask: nextProviderTurnActivityByTask,
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

      if (activeTurnId && userInputPart && !respondThroughHost) {
        const respondUserInput = window.api?.provider?.respondUserInput;
        if (respondUserInput) {
          void respondUserInput({
            turnId: activeTurnId,
            requestId: userInputPart.requestId,
            answers,
            denied,
          })
            .then((result) => {
              if (!result.ok) {
                appendUserInputFailure(
                  `User input delivery failed: ${result.message ?? "unknown"}`,
                );
                return;
              }
              applyUserInputResponse(userInputPart.requestId);
            })
            .catch((error) => {
              appendUserInputFailure(
                `User input delivery failed: ${String(error)}`,
              );
            });
          return;
        }
      }

      if (
        (respondThroughHost || !activeTurnId) &&
        userInputPart &&
        workspaceId &&
        window.api?.localMcp?.respondUserInput
      ) {
        void window.api.localMcp
          .respondUserInput({
            workspaceId,
            taskId,
            requestId: userInputPart.requestId,
            answers,
            denied,
          })
          .then((result) => {
            if (!result.ok) {
              appendUserInputFailure(
                `User input delivery failed: ${result.message ?? "unknown"}`,
              );
              return;
            }
            applyUserInputResponse(userInputPart.requestId);
          })
          .catch((error) => {
            appendUserInputFailure(
              `User input delivery failed: ${String(error)}`,
            );
          });
        return;
      }

      if (
        !activeTurnId &&
        userInputPart &&
        window.api?.provider?.respondUserInput
      ) {
        appendUserInputFailure(
          "User input delivery failed: no active turn found for this task.",
        );
        return;
      }
      if (userInputPart) {
        appendUserInputFailure(
          "User input delivery failed: no active turn found for this task.",
        );
      }
    },
  };
}
