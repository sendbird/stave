import { create } from "zustand";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

export interface ScratchSessionDependencies {
  pickDirectory?: () => Promise<{
    ok: boolean;
    directoryPath?: string;
    stderr?: string;
  }>;
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
}

export function createScratchTaskId() {
  return `scratch-${crypto.randomUUID()}`;
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
  }),
);
