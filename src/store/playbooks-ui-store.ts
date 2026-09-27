import { create } from "zustand";
import { useAppStore } from "./app.store";

/**
 * What the Start mission sheet opens with. The target task is frozen here, at
 * open time, so switching tasks while the sheet is up never retargets it.
 */
export interface StartMissionRequest {
  workspaceId: string;
  taskId: string;
  assignment?: string;
  playbookId?: string;
  /**
   * The assignment came from the composer draft; the draft is cleared once the
   * mission starts, because its text now lives in the mission.
   */
  fromComposerDraft?: boolean;
  /** Runs once the mission has started, e.g. to clear the composer. */
  onStarted?: () => void;
  /** Also runs once the mission has started, with its id: a proposal it started. */
  onMissionStarted?: (missionId: string | null) => void;
}

interface PlaybooksUiState {
  startSheet: StartMissionRequest | null;
  /** A request for the Automations center to show a playbook; consumed by it. */
  centerRequest: { playbookId: string | null; nonce: number } | null;
  openStartSheet: (request: StartMissionRequest) => void;
  closeStartSheet: () => void;
  openPlaybooks: (playbookId?: string | null) => void;
  consumeCenterRequest: () => void;
}

export const usePlaybooksUiStore = create<PlaybooksUiState>((set) => ({
  startSheet: null,
  centerRequest: null,
  openStartSheet: (request) => set({ startSheet: request }),
  closeStartSheet: () => set({ startSheet: null }),
  openPlaybooks: (playbookId = null) => {
    set((state) => ({ centerRequest: { playbookId, nonce: (state.centerRequest?.nonce ?? 0) + 1 } }));
    useAppStore.getState().openAutomationCenter();
  },
  consumeCenterRequest: () => set({ centerRequest: null }),
}));
