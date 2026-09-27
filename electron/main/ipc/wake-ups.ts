import { ipcMain, webContents } from "electron";
import { z } from "zod";
import {
  WAKE_UP_IPC,
  type WakeUpChangedEvent,
  type WakeUpCommandResponse,
  type WakeUpListResponse,
} from "../../../src/lib/supervision/wake-up-bridge";
import { onHostServiceEvent } from "../host-service-client";
import { listWakeUps, pauseWakeUp, removeWakeUp, resumeWakeUp } from "../wake-up-service";

const IdSchema = z.string().trim().min(1).max(256);
const ListArgsSchema = z.object({ workspaceId: IdSchema }).strict();
const SetPausedArgsSchema = z.object({ id: IdSchema, paused: z.boolean() }).strict();
const RemoveArgsSchema = z.object({ id: IdSchema }).strict();

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

let bridgeRegistered = false;

/** The task surfaces' wake-up list, with Pause, Resume and Remove. */
export function registerWakeUpHandlers() {
  if (!bridgeRegistered) {
    bridgeRegistered = true;
    onHostServiceEvent("wake-up.changed", (payload: WakeUpChangedEvent) => {
      for (const contents of webContents.getAllWebContents()) {
        if (!contents.isDestroyed()) contents.send(WAKE_UP_IPC.changed, payload);
      }
    });
  }

  ipcMain.handle(WAKE_UP_IPC.list, async (_event, args: unknown): Promise<WakeUpListResponse> => {
    const parsed = ListArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, wakeUps: [], summaries: [], message: "Invalid wake-up list request." };
    }
    try {
      return { ok: true, ...(await listWakeUps(parsed.data)) };
    } catch (error) {
      return {
        ok: false,
        wakeUps: [],
        summaries: [],
        message: errorMessage(error, "Failed to load wake-ups."),
      };
    }
  });

  ipcMain.handle(WAKE_UP_IPC.setPaused, async (_event, args: unknown): Promise<WakeUpCommandResponse> => {
    const parsed = SetPausedArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, wakeUp: null, message: "Invalid wake-up request." };
    try {
      const wakeUp = parsed.data.paused
        ? await pauseWakeUp({ id: parsed.data.id })
        : await resumeWakeUp({ id: parsed.data.id });
      return { ok: true, wakeUp };
    } catch (error) {
      return { ok: false, wakeUp: null, message: errorMessage(error, "Failed to update the wake-up.") };
    }
  });

  ipcMain.handle(WAKE_UP_IPC.remove, async (_event, args: unknown) => {
    const parsed = RemoveArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, message: "Invalid wake-up request." };
    try {
      await removeWakeUp(parsed.data);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: errorMessage(error, "Failed to remove the wake-up.") };
    }
  });
}
