import type { StoreApi } from "zustand";
import {
  applyChildTasksToProviderTurnActivity,
  clearProviderTurnActivity,
  markProviderTurnInteractionResolved,
  retainRetiredTurnActivity,
} from "@/lib/providers/turn-status";
import { isTaskManaged } from "@/lib/tasks";
import {
  approvalInteractionId,
  userInputInteractionId,
} from "@/lib/work-graph/work-graph-reducer";
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
import { clearAdvisorExchange } from "@/lib/providers/advisor-activity";
import {
  selectAdvisorConsultLog,
  setAdvisorConsultLogVerdict,
} from "@/lib/providers/advisor-consult-log";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type {
  ApprovalPart,
  ChatMessage,
  Task,
  UserInputPart,
} from "@/types/chat";

type ProviderInteractionActionKey =
  | "abortTaskTurn"
  | "skipTaskAdvisor"
  | "dismissAdvisorExchange"
  | "openAdvisorConsultLog"
  | "selectAdvisorConsultLogEntry"
  | "closeAdvisorConsultLog"
  | "setAdvisorConsultVerdict"
  | "resolveApproval"
  | "resolveUserInput"
  | "syncChildTasksIntoTurnGraph";

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
    skipTaskAdvisor: ({ taskId }) => {
      const state = get();
      const activeTurnId = resolveTaskRuntimeTarget({ state, taskId })?.session
        .activeTurnIdsByTask[taskId];
      if (!activeTurnId) {
        return;
      }
      // Deliberately does not touch turn state: the runtime answers with an
      // `advisor_activity` `skipped` phase and the primary turn continues, so
      // the store must not pre-empt that with a local guess.
      void window.api?.provider?.skipAdvisor?.({ turnId: activeTurnId });
    },
    dismissAdvisorExchange: ({ taskId }) => {
      set((state) => {
        const advisorExchangeByTask = clearAdvisorExchange({
          exchangeByTask: state.advisorExchangeByTask,
          taskId,
        });
        return advisorExchangeByTask === state.advisorExchangeByTask
          ? state
          : { advisorExchangeByTask };
      });
    },
    openAdvisorConsultLog: ({ taskId, entryKey }) => {
      // Dismissing the floating card must not erase the log, so opening the
      // dialog deliberately touches nothing but the view state.
      const entries = selectAdvisorConsultLog(
        get().advisorConsultLogByTask,
        taskId,
      );
      const resolvedKey =
        entryKey && entries.some((entry) => entry.key === entryKey)
          ? entryKey
          : (entries[0]?.key ?? null);
      set({ advisorConsultLogView: { taskId, entryKey: resolvedKey } });
    },
    selectAdvisorConsultLogEntry: ({ entryKey }) => {
      const view = get().advisorConsultLogView;
      if (!view || view.entryKey === entryKey) {
        return;
      }
      set({ advisorConsultLogView: { ...view, entryKey } });
    },
    closeAdvisorConsultLog: () => {
      if (!get().advisorConsultLogView) {
        return;
      }
      set({ advisorConsultLogView: null });
    },
    setAdvisorConsultVerdict: ({ taskId, entryKey, verdict }) => {
      // Computed before `set` rather than inside it: a repeat verdict must not
      // reach the store at all, because the persist middleware serializes on
      // every `set` even when the updater returns the same state.
      const state = get();
      const next = setAdvisorConsultLogVerdict({
        logByTask: state.advisorConsultLogByTask,
        tallyByModel: state.advisorVerdictTallyByModel,
        taskId,
        entryKey,
        verdict,
      });
      if (!next) {
        return;
      }
      set({
        advisorConsultLogByTask: next.logByTask,
        advisorVerdictTallyByModel: next.tallyByModel,
      });
    },
    syncChildTasksIntoTurnGraph: ({ taskId, children }) => {
      // Computed before `set` rather than inside it: returning the same state
      // from the updater suppresses the subscriber notification but not the
      // persist middleware, which serializes and writes the store on every
      // `set` regardless. This runs on every child-task change event and is
      // usually a no-op, so it must not reach `set` at all.
      const providerTurnActivityByTask = applyChildTasksToProviderTurnActivity({
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
                interactionId: approvalInteractionId(requestId),
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
                interactionId: userInputInteractionId(requestId),
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
