/**
 * The renderer's view of check-back schedules (wake-ups underneath):
 * `window.api.wakeUps`. Schedules lists them across workspaces and creates,
 * edits, pauses, resumes and removes them; task surfaces read the active
 * workspace's.
 *
 * Used by `electron/preload.ts`, `electron/main/ipc/wake-ups.ts`,
 * `src/types/window-api.d.ts` and `src/store/wake-ups-store.ts`.
 */
import type { WakeUp, WakeUpSummary, WakeUpUpsertInput } from "./wake-up-policy";

export const WAKE_UP_IPC = Object.freeze({
  list: "wake-ups:list",
  create: "wake-ups:create",
  /** A watch Stave adds on its own; only such a watch offers Stop watching in the task. */
  createAutomatic: "wake-ups:create-automatic",
  /** Renderer → host: the global "watch pull requests" switch, for agent discovery. */
  syncSettings: "wake-ups:sync-settings",
  update: "wake-ups:update",
  setPaused: "wake-ups:set-paused",
  remove: "wake-ups:remove",
  /** Main → renderer: a `WakeUpChangedEvent`. */
  changed: "wake-ups:changed",
});

export interface WakeUpChangedEvent {
  wakeUpId: string;
  workspaceId: string;
  taskId: string;
}

/**
 * Why Stave did not watch a PR an agent opened: more than one task in the
 * workspace ran a PR-creating command in the window it was created.
 * Memory-only in the host, like agent PR discovery.
 */
export interface PullRequestAutoWatchHint {
  workspaceId: string;
  taskIds: string[];
  pullRequest: { number: number; url: string };
  reason: "ambiguous-task";
}

export interface WakeUpListResponse {
  ok: boolean;
  wakeUps: WakeUp[];
  summaries: WakeUpSummary[];
  autoWatchHints?: PullRequestAutoWatchHint[];
  message?: string;
}

export interface WakeUpSyncSettings {
  createPrWatchEnabled: boolean;
}

export interface WakeUpCommandResponse {
  ok: boolean;
  wakeUp: WakeUp | null;
  message?: string;
}

export interface WakeUpsBridgeApi {
  /** Omit `workspaceId` to list check-backs across every workspace. */
  list: (args: { workspaceId?: string }) => Promise<WakeUpListResponse>;
  create: (input: WakeUpUpsertInput) => Promise<WakeUpCommandResponse>;
  createAutomatic?: (input: WakeUpUpsertInput) => Promise<WakeUpCommandResponse>;
  syncSettings?: (settings: WakeUpSyncSettings) => Promise<{ ok: boolean }>;
  update: (args: { id: string; input: WakeUpUpsertInput }) => Promise<WakeUpCommandResponse>;
  setPaused: (args: { id: string; paused: boolean }) => Promise<WakeUpCommandResponse>;
  remove: (args: { id: string }) => Promise<{ ok: boolean; message?: string }>;
  subscribeChanged: (listener: (event: WakeUpChangedEvent) => void) => () => void;
}
