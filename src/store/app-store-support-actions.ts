import { createProviderSupportActions } from "./app-store-provider-actions";
import type { StoreApi } from "zustand";
import { workspaceFsAdapter } from "@/lib/fs";
import type { AppNotification } from "@/lib/notifications/notification.types";
import {
  isNotificationAttentionKind,
  isNotificationUnread,
} from "@/lib/notifications/notification.types";
import {
  derivePrStatus,
  type GitHubPrPayload,
  type WorkspacePrInfo,
} from "@/lib/pr-status";
import {
  buildReviewFeedbackFileContexts,
  formatReviewFeedbackPrompt,
} from "@/lib/review-feedback";
import { buildVerificationFixPrompt } from "@/lib/workspace-scripts";
import type {
  AppState,
  NotificationContextOpenResult,
  SendUserMessageResult,
} from "@/store/app-store.types";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { mergeLayoutPatch } from "@/store/layout.utils";
import {
  buildManagedTaskTakeoverStatePatch,
  requestManagedTaskTakeover,
} from "@/store/managed-task-takeover";
import type { NotificationAttentionSync } from "@/store/notification-attention-sync";
import {
  clearNotificationHistoryAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/store/notification-actions";
import { areStringArraysEqual } from "@/store/repository.utils";
import { findPendingApprovalMessageByRequestId } from "@/store/provider-message.utils";
import {
  isWorkspaceTargetCurrent,
  rememberCachedWorkspaceFiles,
  resolveWorkspacePathForId,
} from "@/store/workspace-file-cache";
import { getWorkspaceSessionForState } from "@/store/workspace-runtime-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import { isTaskArchived } from "@/lib/tasks";
import type { ReviewComment } from "@/types/review";

type SupportActionKey =
  | "setWorkspaceBranch"
  | "fetchWorkspacePrStatus"
  | "fetchAllWorkspacePrStatuses"
  | "setLayout"
  | "toggleEditorDiffMode"
  | "toggleEditorMarkdownPreviewMode"
  | "openWorkspacePicker"
  | "refreshRepositoryFiles"
  | "refreshRateLimits"
  | "refreshProviderAvailability"
  | "refreshSkillCatalog"
  | "takeOverTask"
  | "markNotificationRead"
  | "markAllNotificationsRead"
  | "clearNotificationHistory"
  | "openNotificationContext"
  | "resolveNotificationApproval"
  | "addReviewComment"
  | "removeReviewComment"
  | "clearReviewComments"
  | "submitReviewFeedback"
  | "requestVerificationFix";

type SupportActions = Pick<AppState, SupportActionKey>;
type StoreSet = StoreApi<AppState>["setState"];
type StoreGet = StoreApi<AppState>["getState"];

export function createSupportActions(args: {
  set: StoreSet;
  get: StoreGet;
  clearProviderTurnStallTimer: (taskId: string) => void;
  persistWorkspaceSessionInBackground: (args: {
    workspaceId: string;
    session: WorkspaceSessionState;
  }) => void;
  attentionSync: NotificationAttentionSync;
  workspacePrStatusFreshMs: number;
  workspacePrStatusPollConcurrency: number;
  incrementWorkspaceSnapshotVersion: (
    state: Pick<AppState, "workspaceSnapshotVersion">,
  ) => number;
  normalizeSharedSkillsHomeSetting: (value?: string | null) => string;
}): SupportActions {
  const {
    set,
    get,
    clearProviderTurnStallTimer,
    persistWorkspaceSessionInBackground,
    attentionSync,
    workspacePrStatusFreshMs: WORKSPACE_PR_STATUS_FRESH_MS,
    workspacePrStatusPollConcurrency: WORKSPACE_PR_STATUS_POLL_CONCURRENCY,
    incrementWorkspaceSnapshotVersion,
    normalizeSharedSkillsHomeSetting,
  } = args;

  const openNotificationContextInternal = async (
    notification: AppNotification,
    options: { targetSurface?: "task" | "fleet" } = {},
  ): Promise<NotificationContextOpenResult> => {
    const repositoryPath = notification.repositoryPath?.trim();
    if (repositoryPath && repositoryPath !== get().repositoryPath) {
      await get().openRepository({ repositoryPath });
    }

    let afterRepositoryOpen = get();
    const workspaceId = notification.workspaceId?.trim();
    if (workspaceId) {
      let workspaceExists = afterRepositoryOpen.workspaces.some(
        (workspace) => workspace.id === workspaceId,
      );
      if (!workspaceExists) {
        // Another Stave window can create the notifying worktree before this
        // renderer's workspace list sees it.
        await afterRepositoryOpen.refreshWorkspaces();
        afterRepositoryOpen = get();
        workspaceExists = afterRepositoryOpen.workspaces.some(
          (workspace) => workspace.id === workspaceId,
        );
      }
      if (!workspaceExists) {
        return { status: "opened" };
      }
      if (afterRepositoryOpen.activeWorkspaceId !== workspaceId) {
        await afterRepositoryOpen.switchWorkspace({ workspaceId });
      }
      if (get().activeWorkspaceId !== workspaceId) {
        return { status: "opened" };
      }
    }

    const afterWorkspaceOpen = get();
    const taskId = notification.taskId?.trim();
    if (!taskId) {
      return { status: "opened" };
    }

    const targetTask = afterWorkspaceOpen.tasks.find(
      (task) => task.id === taskId,
    );
    if (!targetTask) {
      return { status: "opened" };
    }
    if (isTaskArchived(targetTask)) {
      return {
        status: "archived-task",
        taskId,
        taskTitle:
          targetTask.title.trim() ||
          notification.taskTitle?.trim() ||
          "Untitled Task",
      };
    }

    if (isNotificationAttentionKind(notification.kind)) {
      await get().focusTaskAttention({
        taskId,
        workspaceId,
        repositoryPath,
      });
      if (options.targetSurface === "fleet") {
        get().openFleetView();
      }
      return { status: "opened" };
    }

    if (options.targetSurface === "fleet") {
      await get().focusTaskAttention({
        taskId,
        workspaceId,
        repositoryPath,
      });
      get().openFleetView();
      return { status: "opened" };
    }

    afterWorkspaceOpen.selectTask({ taskId });
    return { status: "opened" };
  };

  return {
    setWorkspaceBranch: ({ workspaceId, branch }) =>
      set((state) => {
        if (
          !state.workspaces.some((workspace) => workspace.id === workspaceId)
        ) {
          return state;
        }
        return {
          workspaceBranchById: {
            ...state.workspaceBranchById,
            [workspaceId]: branch,
          },
        };
      }),
    fetchWorkspacePrStatus: async ({ workspaceId }) => {
      const state = get();
      if (!state.workspaces.some((workspace) => workspace.id === workspaceId))
        return;
      const cwd = state.workspacePathById[workspaceId];
      if (!cwd) return;
      if (state.workspaceDefaultById[workspaceId]) return;
      const repositoryPath = state.repositoryPath;

      const getPrStatus = window.api?.sourceControl?.getPrStatus;
      if (!getPrStatus) return;

      try {
        const result = await getPrStatus({ cwd });
        if (!result.ok) {
          // Keep the last known PR so the badge does not flip to "Create PR"
          // just because gh is unavailable; surface the reason instead.
          const lastError = result.stderr?.trim() || "PR status unavailable.";
          set((s) => {
            if (
              s.workspaceDefaultById[workspaceId] ||
              !isWorkspaceTargetCurrent({
                state: s,
                workspaceId,
                workspacePath: cwd,
                repositoryPath,
              })
            ) {
              return s;
            }
            const previous = s.workspacePrInfoById[workspaceId];
            if (previous?.lastError === lastError) {
              return s;
            }
            return {
              workspacePrInfoById: {
                ...s.workspacePrInfoById,
                [workspaceId]: {
                  pr: previous?.pr ?? null,
                  derived: previous?.derived ?? "no_pr",
                  lastFetched: previous?.lastFetched ?? 0,
                  lastError,
                },
              },
            };
          });
          return;
        }

        const pr = result.pr as GitHubPrPayload | null;
        const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
        const info: WorkspacePrInfo = {
          pr,
          derived,
          lastFetched: Date.now(),
        };

        set((s) => {
          if (
            s.workspaceDefaultById[workspaceId] ||
            !isWorkspaceTargetCurrent({
              state: s,
              workspaceId,
              workspacePath: cwd,
              repositoryPath,
            })
          ) {
            return s;
          }
          return {
            workspacePrInfoById: {
              ...s.workspacePrInfoById,
              [workspaceId]: info,
            },
          };
        });
      } catch {
        // Silently ignore – PR status is best-effort.
      }
    },
    fetchAllWorkspacePrStatuses: async () => {
      const state = get();
      const getPrStatus = window.api?.sourceControl?.getPrStatus;
      if (!getPrStatus) return;

      const now = Date.now();
      const targets = state.workspaces.flatMap((workspace) => {
        const wsId = workspace.id;
        if (state.workspaceDefaultById[wsId]) {
          return [];
        }
        if (wsId === state.activeWorkspaceId) {
          return [];
        }
        const cwd = state.workspacePathById[wsId];
        if (!cwd) {
          return [];
        }
        const lastFetched = state.workspacePrInfoById[wsId]?.lastFetched;
        if (
          typeof lastFetched === "number" &&
          now - lastFetched < WORKSPACE_PR_STATUS_FRESH_MS
        ) {
          return [];
        }
        return [{ wsId, cwd, repositoryPath: state.repositoryPath }];
      });
      if (targets.length === 0) {
        return;
      }

      const updates: Array<[string, string, string | null, WorkspacePrInfo]> =
        [];
      let targetIndex = 0;
      const fetchNext = async () => {
        while (targetIndex < targets.length) {
          const target = targets[targetIndex];
          targetIndex += 1;
          if (!target) {
            continue;
          }

          try {
            const result = await getPrStatus({ cwd: target.cwd });
            if (!result.ok) continue;

            const pr = result.pr as GitHubPrPayload | null;
            const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
            updates.push([
              target.wsId,
              target.cwd,
              target.repositoryPath,
              {
                pr,
                derived,
                lastFetched: Date.now(),
              },
            ]);
          } catch {
            // ignore
          }
        }
      };

      await Promise.all(
        Array.from(
          {
            length: Math.min(
              WORKSPACE_PR_STATUS_POLL_CONCURRENCY,
              targets.length,
            ),
          },
          () => fetchNext(),
        ),
      );
      if (updates.length === 0) {
        return;
      }
      set((s) => {
        const freshUpdates = updates.filter(
          ([workspaceId, cwd, repositoryPath]) =>
            !s.workspaceDefaultById[workspaceId] &&
            isWorkspaceTargetCurrent({
              state: s,
              workspaceId,
              workspacePath: cwd,
              repositoryPath,
            }),
        );
        if (freshUpdates.length === 0) {
          return s;
        }
        return {
          workspacePrInfoById: {
            ...s.workspacePrInfoById,
            ...Object.fromEntries(
              freshUpdates.map(([workspaceId, , , info]) => [
                workspaceId,
                info,
              ]),
            ),
          },
        };
      });
    },
    setLayout: ({ patch }) =>
      set((state) => {
        const nextLayout = mergeLayoutPatch({
          layout: state.layout,
          patch,
        });
        if (!nextLayout) {
          return state;
        }
        return {
          layout: nextLayout,
          ...(nextLayout.terminalDocked !== state.layout.terminalDocked
            ? {
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              }
            : {}),
        };
      }),
    toggleEditorDiffMode: () =>
      set((state) => {
        const nextEditorDiffMode = !state.layout.editorDiffMode;
        return {
          layout: {
            ...state.layout,
            editorDiffMode: nextEditorDiffMode,
            // Diff and markdown preview are mutually exclusive views.
            editorMarkdownPreviewMode: nextEditorDiffMode
              ? false
              : state.layout.editorMarkdownPreviewMode,
          },
        };
      }),
    toggleEditorMarkdownPreviewMode: () =>
      set((state) => {
        const activeTab = state.editorTabs.find(
          (tab) => tab.id === state.activeEditorTabId,
        );
        const activeTabIsMarkdown = Boolean(
          activeTab &&
          activeTab.kind !== "image" &&
          activeTab.language === "markdown",
        );
        if (!activeTabIsMarkdown) {
          return {};
        }
        const nextPreviewMode = !state.layout.editorMarkdownPreviewMode;
        return {
          layout: {
            ...state.layout,
            editorMarkdownPreviewMode: nextPreviewMode,
            // Diff and markdown preview are mutually exclusive views.
            editorDiffMode: nextPreviewMode
              ? false
              : state.layout.editorDiffMode,
          },
        };
      }),
    openWorkspacePicker: async () => {
      const root = await workspaceFsAdapter.pickRoot();
      if (!root) {
        return;
      }
      set((state) => ({
        repositoryName: root.rootName,
        repositoryFiles: root.files,
      }));
    },
    refreshRepositoryFiles: async () => {
      const files = await workspaceFsAdapter.listFiles();
      const state = get();
      const workspacePath = resolveWorkspacePathForId({
        activeWorkspaceId: state.activeWorkspaceId,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        repositoryPath: state.repositoryPath,
      });
      set((current) => {
        const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
          workspaceFileCacheByPath: current.workspaceFileCacheByPath,
          workspacePath,
          files,
        });
        if (
          areStringArraysEqual(current.repositoryFiles, files) &&
          nextWorkspaceFileCacheByPath === current.workspaceFileCacheByPath
        ) {
          return current;
        }
        return {
          repositoryFiles: files,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
        };
      });
    },
    ...createProviderSupportActions({ set, get }),
    refreshSkillCatalog: async (args = {}) => {
      const getCatalog = window.api?.skills?.getCatalog;
      const fallbackWorkspacePath =
        get().workspacePathById[get().activeWorkspaceId] ??
        get().repositoryPath ??
        null;
      const workspacePath =
        args.workspacePath === undefined
          ? fallbackWorkspacePath
          : args.workspacePath;
      const sharedSkillsHome =
        normalizeSharedSkillsHomeSetting(get().settings.sharedSkillsHome) ||
        null;

      if (!getCatalog) {
        set(() => ({
          skillCatalog: {
            status: "error",
            workspacePath,
            sharedSkillsHome,
            fetchedAt: new Date().toISOString(),
            skills: [],
            roots: [],
            detail: "Skill catalog API is unavailable in this build.",
          },
        }));
        return;
      }

      set((state) => ({
        skillCatalog: {
          ...state.skillCatalog,
          status: "loading",
          workspacePath,
          sharedSkillsHome,
          detail: "Loading skill catalog...",
        },
      }));

      try {
        const result = await getCatalog({
          ...(workspacePath ? { workspacePath } : {}),
          ...(sharedSkillsHome ? { sharedSkillsHome } : {}),
        });
        // Use the frontend-normalized `workspacePath` and `sharedSkillsHome`
        // rather than the backend-expanded values so that the comparison keys
        // in component useEffects stay consistent (the backend expands `~`
        // and resolves symlinks, but the component compares against the raw
        // settings string, which would otherwise never match and cause an
        // infinite re-fetch loop).
        set(() => ({
          skillCatalog: {
            status: result.ok ? "ready" : "error",
            workspacePath,
            sharedSkillsHome,
            fetchedAt: result.catalog.fetchedAt,
            skills: result.catalog.skills,
            roots: result.catalog.roots,
            detail: result.ok
              ? result.catalog.detail
              : result.message?.trim() || result.catalog.detail,
          },
        }));
      } catch (error) {
        set(() => ({
          skillCatalog: {
            status: "error",
            workspacePath,
            sharedSkillsHome,
            fetchedAt: new Date().toISOString(),
            skills: [],
            roots: [],
            detail: String(error),
          },
        }));
      }
    },
    takeOverTask: async ({ taskId }) => {
      const result = await requestManagedTaskTakeover({
        taskId,
        state: get(),
      });
      if (!result.ok) {
        return result;
      }
      const activeTurnId = get().activeTurnIdsByTask[taskId];
      set((state) =>
        buildManagedTaskTakeoverStatePatch({
          state,
          taskId,
          sourceContexts: result.sourceContexts,
          updatedAt: buildRecentTimestamp(),
        }),
      );
      clearProviderTurnStallTimer(taskId);
      attentionSync.syncTaskInteractions({
        taskId,
        messages: get().messagesByTask[taskId] ?? [],
        endedTurnId: activeTurnId,
      });
      const session = getWorkspaceSessionForState({
        state: get(),
        workspaceId: result.workspaceId,
      });
      if (session) {
        persistWorkspaceSessionInBackground({
          workspaceId: result.workspaceId,
          session,
        });
      }
      return result.craneReceiptPending
        ? { ok: true, craneReceiptPending: true }
        : { ok: true };
    },
    markNotificationRead: ({ id, resolvedAt }) =>
      markNotificationReadAction({ set, get, id, resolvedAt }),
    markAllNotificationsRead: () =>
      markAllNotificationsReadAction({ set, get }),
    clearNotificationHistory: () =>
      clearNotificationHistoryAction({ set, get }),
    openNotificationContext: async ({ notificationId, targetSurface }) => {
      const notification = get().notifications.find(
        (item) => item.id === notificationId,
      );
      if (!notification) {
        return { status: "opened" };
      }
      const result = await openNotificationContextInternal(notification, {
        targetSurface,
      });
      if (
        isNotificationUnread(notification) &&
        !isNotificationAttentionKind(notification.kind)
      ) {
        await get().markNotificationRead({ id: notification.id });
      }
      return result;
    },
    resolveNotificationApproval: async ({ notificationId, approved }) => {
      const notification = get().notifications.find(
        (item) => item.id === notificationId,
      );
      if (!notification || notification.action?.type !== "approval") {
        return;
      }

      await openNotificationContextInternal(notification);
      const latestState = get();
      const taskId = notification.taskId?.trim();
      if (!taskId) {
        return;
      }

      const locatedApproval = findPendingApprovalMessageByRequestId({
        messages: latestState.messagesByTask[taskId] ?? [],
        requestId: notification.action.requestId,
      });

      if (!locatedApproval) {
        return;
      }

      latestState.resolveApproval({
        taskId,
        messageId: notification.action.messageId ?? locatedApproval.messageId,
        approved,
      });
    },
    addReviewComment: ({ taskId, filePath, line, side, body }) => {
      const normalizedTaskId = taskId.trim();
      const normalizedFilePath = filePath.trim();
      const normalizedBody = body.trim();
      if (!normalizedTaskId || !normalizedFilePath || !normalizedBody) {
        return null;
      }

      const normalizedLine =
        Number.isInteger(line) && line && line > 0 ? line : undefined;
      const comment: ReviewComment = {
        id: crypto.randomUUID(),
        filePath: normalizedFilePath,
        ...(normalizedLine ? { line: normalizedLine } : {}),
        side: side === "original" ? "original" : "modified",
        body: normalizedBody,
        createdAt: buildRecentTimestamp(),
      };

      set((state) => ({
        reviewCommentsByTask: {
          ...state.reviewCommentsByTask,
          [normalizedTaskId]: [
            ...(state.reviewCommentsByTask[normalizedTaskId] ?? []),
            comment,
          ],
        },
        workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
      }));

      return comment;
    },
    removeReviewComment: ({ taskId, commentId }) => {
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId || !commentId) {
        return;
      }
      set((state) => {
        const current = state.reviewCommentsByTask[normalizedTaskId] ?? [];
        const nextComments = current.filter(
          (comment) => comment.id !== commentId,
        );
        if (nextComments.length === current.length) {
          return state;
        }
        const nextByTask = { ...state.reviewCommentsByTask };
        if (nextComments.length > 0) {
          nextByTask[normalizedTaskId] = nextComments;
        } else {
          delete nextByTask[normalizedTaskId];
        }
        return {
          reviewCommentsByTask: nextByTask,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    clearReviewComments: ({ taskId }) => {
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId) {
        return;
      }
      set((state) => {
        if (!state.reviewCommentsByTask[normalizedTaskId]) {
          return state;
        }
        const nextByTask = { ...state.reviewCommentsByTask };
        delete nextByTask[normalizedTaskId];
        return {
          reviewCommentsByTask: nextByTask,
          workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
        };
      });
    },
    submitReviewFeedback: async ({ taskId }) => {
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId) {
        return { status: "blocked" } satisfies SendUserMessageResult;
      }

      const state = get();
      const comments = state.reviewCommentsByTask[normalizedTaskId] ?? [];
      const content = formatReviewFeedbackPrompt({ comments });
      if (!content) {
        return { status: "blocked" } satisfies SendUserMessageResult;
      }

      const result = await get().sendUserMessage({
        taskId: normalizedTaskId,
        content,
        turnOrigin: "conversation",
        fileContexts: buildReviewFeedbackFileContexts({
          comments,
          editorTabs: state.editorTabs,
        }),
      });

      if (result.status !== "blocked") {
        get().clearReviewComments({ taskId: normalizedTaskId });
      }

      return result;
    },
    requestVerificationFix: async ({ workspaceId, scriptId }) => {
      const result = get().turnVerificationByWorkspace[workspaceId];
      if (!result || result.failures.length === 0 || !result.taskId) {
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      const content = buildVerificationFixPrompt(result, { scriptId });
      if (!content.trim()) {
        return { status: "blocked" } satisfies SendUserMessageResult;
      }
      return get().sendUserMessage({
        taskId: result.taskId,
        content,
        turnOrigin: "conversation",
      });
    },
  };
}
