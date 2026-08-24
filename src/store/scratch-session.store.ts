import { create } from "zustand";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";
import type { AppSettings } from "@/store/app-settings";
import type { ProviderAdapter } from "@/lib/providers/provider.types";
import { applyModelRuntimePreference } from "@/lib/providers/model-runtime-preferences";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import { runProviderTurn } from "@/store/provider-turn-runtime";
import {
  buildMessageId,
  buildRecentTimestamp,
  createUserTextPart,
} from "@/store/chat-state-helpers";

export interface ScratchSessionDependencies {
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
  runTurn?: ProviderAdapter["runTurn"];
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

    ingestEvent: ({ event }) => {
      if (event.type === "done") {
        set({ activeTurnId: null });
      }
    },
  }),
);
