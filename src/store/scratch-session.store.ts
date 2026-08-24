import { create } from "zustand";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage, ApprovalPart } from "@/types/chat";
import type { AppSettings } from "@/store/app-settings";
import type { ProviderAdapter } from "@/lib/providers/provider.types";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { runProviderTurn } from "@/store/provider-turn-runtime";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import {
  buildMessageId,
  buildRecentTimestamp,
  createUserTextPart,
} from "@/store/chat-state-helpers";
import {
  findPendingApprovals,
  interruptPendingToolInteractionsInMessages,
  updateApprovalPartsByRequestId,
} from "@/store/provider-message.utils";

export interface ScratchSessionDependencies {
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
  runTurn?: ProviderAdapter["runTurn"];
  abortTurn?: (args: { turnId: string }) => Promise<{ ok: boolean; message?: string }>;
  respondApproval?: (args: {
    turnId: string;
    requestId: string;
    approved: boolean;
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

  setProvider: (args: { provider: ProviderId }) => void;
  setFolder: (args: { directoryPath: string }) => {
    ok: boolean;
    message?: string;
  };
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

function isAbsolutePosixOrWindowsPath(candidate: string) {
  return candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate);
}

export function selectScratchPendingApprovals(
  state: ScratchSessionState,
): Array<{ messageId: string; part: ApprovalPart }> {
  return findPendingApprovals({ messages: state.messages });
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

    pickFolder: async (dependencies) => {
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
        taskId: createScratchTaskId(),
      });
    },

    send: async ({ prompt, settings }, dependencies) => {
      const state = get();
      if (!state.folderPath) {
        set({ error: "Pick a folder before sending a message." });
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
        settings: applyModelRuntimePreference({
          settings,
          providerId: provider,
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
      const abortTurn = dependencies?.abortTurn ?? window.api?.provider?.abortTurn;
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
        set({ error: `Approval delivery failed: ${result.message ?? "unknown"}` });
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

    // User-facing "clear": abort the live turn, interrupt pending approvals,
    // release the provider task, then wipe the transcript and issue a fresh
    // taskId — but keep folderPath and provider so the next turn stays in place.
    // Unlike `reset`, this calls into the provider IPC and preserves the folder.
    clear: async (dependencies) => {
      const previousTaskId = get().taskId;
      await get().stop(dependencies);

      const cleanupTask =
        dependencies?.cleanupTask ?? window.api?.provider?.cleanupTask;
      await cleanupTask?.({ taskId: previousTaskId });

      set({
        messages: [],
        activeTurnId: null,
        providerSession: {},
        error: null,
        taskId: createScratchTaskId(),
      });
    },
  }),
);
