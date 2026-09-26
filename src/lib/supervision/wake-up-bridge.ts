/**
 * The renderer's view of wake-ups: `window.api.wakeUps`. Wake-ups used to be
 * reachable only through Local MCP; the task surfaces now list them with
 * Pause, Resume and Remove.
 *
 * Used by `electron/preload.ts`, `electron/main/ipc/wake-ups.ts`,
 * `src/types/window-api.d.ts` and `src/store/wake-ups-store.ts`.
 */
import type { WakeUp, WakeUpSummary } from "./wake-up-policy";

export const WAKE_UP_IPC = Object.freeze({
  list: "wake-ups:list",
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

export interface WakeUpListResponse {
  ok: boolean;
  wakeUps: WakeUp[];
  summaries: WakeUpSummary[];
  message?: string;
}

export interface WakeUpCommandResponse {
  ok: boolean;
  wakeUp: WakeUp | null;
  message?: string;
}

export interface WakeUpsBridgeApi {
  list: (args: { workspaceId: string }) => Promise<WakeUpListResponse>;
  setPaused: (args: { id: string; paused: boolean }) => Promise<WakeUpCommandResponse>;
  remove: (args: { id: string }) => Promise<{ ok: boolean; message?: string }>;
  subscribeChanged: (listener: (event: WakeUpChangedEvent) => void) => () => void;
}
