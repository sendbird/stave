/**
 * Main-process bridge to the host service's supervisor.
 *
 * Used by: `electron/main/stave-mcp-server.ts` (the `stave_*_wake_up`
 * tools). The task UI reaches the same actions through `ipc/wake-ups.ts`.
 */
import type { HostWakeUpAction } from "../host-service/protocol";
import type {
  WakeUp,
  WakeUpOccurrence,
  WakeUpUpsertInput,
} from "../../src/lib/supervision/wake-up-policy";
import type { WakeUpSnapshot } from "../host-service/wake-up-runtime";
import type { WakeUpSyncSettings } from "../../src/lib/supervision/wake-up-bridge";
import { invokeHostService } from "./host-service-client";

function invokeWakeUp<TResult>(
  action: HostWakeUpAction,
  args: unknown,
) {
  return invokeHostService("wake-up.invoke", {
    action,
    args,
  }) as Promise<TResult>;
}

export function listWakeUps(args: { workspaceId?: string } = {}) {
  return invokeWakeUp<WakeUpSnapshot>("list", args);
}

export function getWakeUp(args: { id: string }) {
  return invokeWakeUp<{
    wakeUp: WakeUp;
    occurrences: WakeUpOccurrence[];
  }>("get", args);
}

export function createWakeUp(input: WakeUpUpsertInput) {
  return invokeWakeUp<WakeUp>("create", input);
}

/** A pull request watch Stave adds on its own (after Create PR). */
export function createAutomaticWakeUp(input: WakeUpUpsertInput) {
  return invokeWakeUp<WakeUp>("create-automatic", input);
}

export function syncWakeUpSettings(settings: WakeUpSyncSettings) {
  return invokeWakeUp<{ ok: true }>("sync-settings", settings);
}

export function updateWakeUp(args: {
  id: string;
  input: WakeUpUpsertInput;
}) {
  return invokeWakeUp<WakeUp>("update", args);
}

export function pauseWakeUp(args: { id: string }) {
  return invokeWakeUp<WakeUp>("pause", args);
}

export function resumeWakeUp(args: { id: string }) {
  return invokeWakeUp<WakeUp>("resume", args);
}

export function removeWakeUp(args: { id: string }) {
  return invokeWakeUp<{ ok: true; id: string }>("remove", args);
}
