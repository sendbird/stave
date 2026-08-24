import { create } from "zustand";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { ApprovalPart, ChatMessage, UserInputPart } from "@/types/chat";
import type { AppSettings } from "@/store/app-settings";
import type { ProviderAdapter } from "@/lib/providers/provider.types";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { runProviderTurn } from "@/store/provider-turn-runtime";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import { isAbsolutePosixOrWindowsPath } from "@/lib/path-utils";
import {
  buildMessageId,
  buildRecentTimestamp,
  createUserTextPart,
} from "@/store/chat-state-helpers";
import {
  findPendingApprovals,
  interruptPendingToolInteractionsInMessages,
  updateApprovalPartsByRequestId,
  updateUserInputPartsByRequestId,
} from "@/store/provider-message.utils";

export interface ScratchSessionDependencies {
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
  runTurn?: ProviderAdapter["runTurn"];
  abortTurn?: (args: {
    turnId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
  respondUserInput?: (args: {
    turnId: string;
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => Promise<{ ok: boolean; message?: string }>;
  cleanupTask?: (args: {
    taskId: string;
  }) => Promise<{ ok: boolean; message?: string }>;
}

export interface ScratchSessionState {
  folderPath: string | null;
  provider: ProviderId;
  taskId: string;
  messages: ChatMessage[];
  activeTurnId: string | null;
  providerSession: TaskProviderSessionState;
  error: string | null;
  isClearing: boolean;

  setProvider: (args: { provider: ProviderId }) => void;
  setFolder: (args: { directoryPath: string }) => {
    ok: boolean;
    message?: string;
  };
  pickDirectory: (
    dependencies?: ScratchSessionDependencies,
  ) => Promise<{ ok: boolean; directoryPath?: string; message?: string }>;
  pickFolder: (
    dependencies?: ScratchSessionDependencies,
  ) => Promise<{ ok: boolean; message?: string }>;
  reset: () => void;
  send: (
    args: { prompt: string; settings: AppSettings },
    dependencies?: ScratchSessionDependencies,
  ) => Promise<void>;
  ingestEvent: (args: {
    event: NormalizedProviderEvent;
    turnId: string;
    provider: ProviderId;
    model: string;
  }) => void;
  stop: (dependencies?: ScratchSessionDependencies) => Promise<void>;
  respondApproval: (
    args: { requestId: string; approved: boolean },
    dependencies?: ScratchSessionDependencies,
  ) => Promise<void>;
  respondUserInput: (
    args: {
      requestId: string;
      answers?: Record<string, string>;
      denied?: boolean;
    },
    dependencies?: ScratchSessionDependencies,
  ) => Promise<void>;
  clear: (dependencies?: ScratchSessionDependencies) => Promise<void>;
}

export function createScratchTaskId() {
  return `scratch-${crypto.randomUUID()}`;
}

export function resolveScratchModel(args: {
  provider: ProviderId;
  settings: AppSettings;
}): string {
  return args.provider === "claude-code"
    ? args.settings.modelClaude
    : args.settings.modelCodex;
}

export function selectScratchPendingApprovals(
  state: ScratchSessionState,
): Array<{ messageId: string; part: ApprovalPart }> {
  return findPendingApprovals({ messages: state.messages });
}

export function selectScratchPendingUserInputs(
  state: ScratchSessionState,
): Array<{ messageId: string; part: UserInputPart }> {
  const pending: Array<{ messageId: string; part: UserInputPart }> = [];
  for (
    let messageIndex = state.messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = state.messages[messageIndex];
    if (!message) {
      continue;
    }
    for (
      let partIndex = message.parts.length - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      const part = message.parts[partIndex];
      if (part?.type === "user_input" && part.state === "input-requested") {
        pending.push({ messageId: message.id, part });
      }
    }
  }
  return pending;
}

export function resolveScratchRuntimeSettings(args: {
  provider: ProviderId;
  model: string;
  settings: AppSettings;
}): AppSettings {
  const settings = applyModelRuntimePreference({
    settings: args.settings,
    providerId: args.provider,
    model: args.model,
  });
  return {
    ...settings,
    claudePermissionMode:
      settings.claudePermissionMode === "plan"
        ? (settings.claudePermissionModeBeforePlan ?? "auto")
        : settings.claudePermissionMode,
    codexPlanMode: false,
  };
}

export const useScratchSessionStore = create<ScratchSessionState>()(
  (set, get) => ({
    folderPath: null,
    provider: "claude-code",
    taskId: createScratchTaskId(),
    messages: [],
    activeTurnId: null,
    providerSession: {},
    error: null,
    isClearing: false,

    setProvider: ({ provider }) => {
      set({ provider });
    },

    setFolder: ({ directoryPath }) => {
      if (!isAbsolutePosixOrWindowsPath(directoryPath)) {
        const message = "Scratch sessions need an absolute folder path.";
        set({ error: message });
        return { ok: false, message };
      }
      set({ folderPath: directoryPath, error: null });
      return { ok: true };
    },

    pickDirectory: async (dependencies) => {
      const pickDirectory =
        dependencies?.pickDirectory ?? window.api?.fs?.pickDirectory;
      if (!pickDirectory) {
        const message = "The folder picker is unavailable in this environment.";
        set({ error: message });
        return { ok: false, message };
      }

      const picked = await pickDirectory();
      if (!picked.ok || !picked.directoryPath) {
        // A cancelled picker is not an error: keep the current folder and stay quiet.
        return { ok: false, message: picked.stderr };
      }
      return { ok: true, directoryPath: picked.directoryPath };
    },

    pickFolder: async (dependencies) => {
      const picked = await get().pickDirectory(dependencies);
      if (!picked.ok || !picked.directoryPath) {
        return { ok: false, message: picked.message };
      }
      return get().setFolder({ directoryPath: picked.directoryPath });
    },

    // Test-only, synchronous reset: also clears folderPath and issues no IPC.
    // For the user-facing "clear" action (which aborts the turn and releases the
    // provider task while keeping the folder), use `clear` instead.
    reset: () => {
      set({
        folderPath: null,
        messages: [],
        activeTurnId: null,
        providerSession: {},
        error: null,
        isClearing: false,
        taskId: createScratchTaskId(),
      });
    },

    send: async ({ prompt, settings }, dependencies) => {
      const state = get();
      if (!state.folderPath) {
        set({ error: "Pick a folder before sending a message." });
        return;
      }
      if (state.isClearing) {
        set({ error: "Wait for the scratch session to finish clearing." });
        return;
      }
      if (state.activeTurnId) {
        set({ error: "A scratch turn is already running." });
        return;
      }
      if (prompt.trim().length === 0) {
        return;
      }

      const provider = state.provider;
      const model = resolveScratchModel({ provider, settings });
      const turnId = crypto.randomUUID();
      const baseCount = state.messages.length;

      const userMessage: ChatMessage = {
        id: buildMessageId({ taskId: state.taskId, count: baseCount }),
        role: "user",
        model: "user",
        providerId: "user",
        content: prompt,
        parts: [createUserTextPart({ text: prompt })],
      };
      const assistantMessage: ChatMessage = {
        id: buildMessageId({ taskId: state.taskId, count: baseCount + 1 }),
        role: "assistant",
        model,
        providerId: provider,
        content: "",
        startedAt: buildRecentTimestamp(),
        isStreaming: true,
        parts: [],
      };

      set({
        messages: [...state.messages, userMessage, assistantMessage],
        activeTurnId: turnId,
        error: null,
      });

      const runtimeOptions = buildProviderRuntimeOptions({
        provider,
        model,
        includeAdvisor: false,
        settings: resolveScratchRuntimeSettings({
          settings,
          provider,
          model,
        }),
        providerSession: get().providerSession,
      });

      runProviderTurn(
        {
          turnId,
          provider,
          prompt,
          taskId: state.taskId,
          cwd: state.folderPath,
          runtimeOptions,
          onEvent: ({ event }) => {
            get().ingestEvent({ event, turnId, provider, model });
          },
        },
        dependencies?.runTurn ? { runTurn: dependencies.runTurn } : undefined,
      );
    },

    ingestEvent: ({ event, turnId, provider, model }) => {
      const state = get();
      if (state.activeTurnId !== turnId) {
        return;
      }

      const next = replayProviderEventsToTaskState({
        taskId: state.taskId,
        messages: state.messages,
        events: [event],
        provider,
        model,
        turnId,
        providerSession: state.providerSession,
        messageCount: state.messages.length,
      });

      if (!next.changed) {
        return;
      }

      set({
        messages: next.messages,
        activeTurnId: next.activeTurnId ?? null,
        providerSession: next.providerSession ?? state.providerSession,
      });
    },

    stop: async (dependencies) => {
      const state = get();
      const turnId = state.activeTurnId;
      set({
        activeTurnId: null,
        messages: interruptPendingToolInteractionsInMessages({
          messages: state.messages,
        }),
      });
      if (!turnId) {
        return;
      }
      const abortTurn =
        dependencies?.abortTurn ?? window.api?.provider?.abortTurn;
      await abortTurn?.({ turnId });
    },

    respondApproval: async ({ requestId, approved }, dependencies) => {
      const state = get();
      const turnId = state.activeTurnId;
      if (!turnId) {
        set({
          error:
            "That approval can no longer be answered — the scratch turn already ended.",
        });
        return;
      }

      const respondApproval =
        dependencies?.respondApproval ?? window.api?.provider?.respondApproval;
      if (!respondApproval) {
        set({ error: "Approval delivery is unavailable in this environment." });
        return;
      }

      let result: { ok: boolean; message?: string };
      try {
        result = await respondApproval({ turnId, requestId, approved });
      } catch (error) {
        set({ error: `Approval delivery failed: ${String(error)}` });
        return;
      }

      if (!result.ok) {
        set({
          error: `Approval delivery failed: ${result.message ?? "unknown"}`,
        });
        return;
      }

      // Re-check that the turn is still live after the async IPC call.
      // If stop() ran between the call and this point, don't revert the interruption.
      if (get().activeTurnId !== turnId) {
        return;
      }

      set({
        error: null,
        messages: get().messages.map((message) => ({
          ...message,
          parts: updateApprovalPartsByRequestId({
            parts: message.parts,
            requestId,
            approved,
          }),
        })),
      });
    },

    respondUserInput: async ({ requestId, answers, denied }, dependencies) => {
      const state = get();
      const turnId = state.activeTurnId;
      if (!turnId) {
        set({
          error:
            "That question can no longer be answered — the scratch turn already ended.",
        });
        return;
      }

      const respondUserInput =
        dependencies?.respondUserInput ??
        window.api?.provider?.respondUserInput;
      if (!respondUserInput) {
        set({ error: "Answer delivery is unavailable in this environment." });
        return;
      }

      let result: { ok: boolean; message?: string };
      try {
        result = await respondUserInput({
          turnId,
          requestId,
          answers,
          denied,
        });
      } catch (error) {
        set({ error: `Answer delivery failed: ${String(error)}` });
        return;
      }

      if (!result.ok) {
        set({
          error: `Answer delivery failed: ${result.message ?? "unknown"}`,
        });
        return;
      }

      if (get().activeTurnId !== turnId) {
        return;
      }

      set({
        error: null,
        messages: get().messages.map((message) => ({
          ...message,
          parts: updateUserInputPartsByRequestId({
            parts: message.parts,
            requestId,
            answers,
            denied,
          }),
        })),
      });
    },

    // User-facing "clear": wipe the local session immediately, then abort and
    // release the previous provider task in the background. Keep folderPath and
    // provider so the next turn stays in place. Unlike `reset`, this calls IPC.
    clear: async (dependencies) => {
      const state = get();
      if (state.isClearing) {
        return;
      }
      const previousTaskId = state.taskId;
      const previousTurnId = state.activeTurnId;
      const nextTaskId = createScratchTaskId();

      // Rotate all local session identity before the first await. This makes Clear
      // atomic from the renderer's perspective: stale events are ignored and send
      // remains disabled until the previous provider task has been released.
      set({
        messages: [],
        activeTurnId: null,
        providerSession: {},
        error: null,
        isClearing: true,
        taskId: nextTaskId,
      });

      // Remote release (abort + cleanup) is best-effort: if either IPC rejects,
      // swallow it because the requested local wipe has already completed.
      try {
        if (previousTurnId) {
          const abortTurn =
            dependencies?.abortTurn ?? window.api?.provider?.abortTurn;
          await abortTurn?.({ turnId: previousTurnId });
        }

        const cleanupTask =
          dependencies?.cleanupTask ?? window.api?.provider?.cleanupTask;
        await cleanupTask?.({ taskId: previousTaskId });
      } catch {
        // Best-effort remote release; the local wipe is what matters.
      } finally {
        // A test-only reset or a future session rotation may have superseded this
        // clear while IPC was pending. Only release the matching clear lock.
        if (get().taskId === nextTaskId) {
          set({ isClearing: false });
        }
      }
    },
  }),
);
