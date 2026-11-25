import { ipcMain, webContents } from "electron";
import path from "node:path";
import { z } from "zod";
import {
  WORKSPACE_SCRATCH_CHANGED_CHANNEL,
  WORKSPACE_SCRATCH_TAIL_BYTES,
  type WorkspaceScratchChangedEvent,
} from "../../../src/lib/workspace-scratch";
import { ensureWorkspaceScratch, WorkspaceScratchRefusedError } from "../utils/workspace-scratch";
import { readWorkspaceScratchTail, WorkspaceScratchFileMissingError } from "../utils/workspace-scratch-tail";
import { WorkspaceScratchWatchHub, type ScratchWatchPort } from "../utils/workspace-scratch-watch";
import { isKnownWorkspaceRoot } from "../workspace-roots";

/**
 * Scratch panel IPC beyond the listing (`fs:list-scratch` lives with the
 * other filesystem handlers):
 *
 * - `fs:watch-scratch` / `fs:unwatch-scratch`: a window's open Scratch panel
 *   subscribes to change notices (`scratch:changed`) for one workspace folder.
 * - `fs:read-scratch-tail`: the last 256 KB of a text file, for the preview.
 *
 * Every request names a workspace root Stave has registered.
 */
const ScratchRootArgsSchema = z.object({ rootPath: z.string().min(1).max(4096) }).strict();
const ScratchTailArgsSchema = z
  .object({
    rootPath: z.string().min(1).max(4096),
    filePath: z.string().min(1).max(4096),
    wholeHtml: z.boolean().optional(),
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    maxBytes: z.number().int().positive().max(WORKSPACE_SCRATCH_TAIL_BYTES).optional(),
  })
  .strict();

export function registerWorkspaceScratchHandlers(
  deps: {
    isKnownWorkspaceRoot?: (rootPath: string) => Promise<boolean>;
    watchPort?: ScratchWatchPort;
    /** Delivers a change notice to a window; defaults to `webContents.send`. */
    send?: (contentsId: number, event: WorkspaceScratchChangedEvent) => boolean;
    /** Calls `onDestroyed` once when the window goes away; false when it already has. */
    onWindowDestroyed?: (contentsId: number, onDestroyed: () => void) => boolean;
  } = {},
) {
  const isKnownRoot = deps.isKnownWorkspaceRoot ?? isKnownWorkspaceRoot;
  const send =
    deps.send ??
    ((contentsId: number, event: WorkspaceScratchChangedEvent) => {
      const contents = webContents.fromId(contentsId);
      if (!contents || contents.isDestroyed()) return false;
      contents.send(WORKSPACE_SCRATCH_CHANGED_CHANNEL, event);
      return true;
    });
  const onWindowDestroyed =
    deps.onWindowDestroyed ??
    ((contentsId: number, onDestroyed: () => void) => {
      const contents = webContents.fromId(contentsId);
      if (!contents || contents.isDestroyed()) return false;
      contents.once("destroyed", onDestroyed);
      return true;
    });

  const hub = new WorkspaceScratchWatchHub({
    notify: (contentsId, event) => {
      if (!send(contentsId, event)) hub.removeSubscriber(contentsId);
    },
    ensureFolder: (rootPath) => ensureWorkspaceScratch(rootPath),
    ...(deps.watchPort ? { port: deps.watchPort } : {}),
  });
  const cleanupRegistered = new Set<number>();

  async function validRoot(args: unknown) {
    const parsed = ScratchRootArgsSchema.safeParse(args);
    if (!parsed.success || !path.isAbsolute(parsed.data.rootPath)) return null;
    return (await isKnownRoot(parsed.data.rootPath)) ? parsed.data.rootPath : null;
  }

  ipcMain.handle("fs:watch-scratch", async (event: { sender: { id: number } }, args: unknown) => {
    const rootPath = await validRoot(args);
    if (!rootPath) return { ok: false as const, stderr: "Not a known workspace folder." };
    const contentsId = event.sender.id;
    if (!cleanupRegistered.has(contentsId)) {
      const registered = onWindowDestroyed(contentsId, () => {
        cleanupRegistered.delete(contentsId);
        hub.removeSubscriber(contentsId);
      });
      if (!registered) return { ok: false as const, stderr: "The window is closed." };
      cleanupRegistered.add(contentsId);
    }
    const { watching } = await hub.subscribe(contentsId, rootPath);
    return { ok: true as const, watching };
  });

  ipcMain.handle("fs:unwatch-scratch", async (event: { sender: { id: number } }, args: unknown) => {
    const parsed = ScratchRootArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false as const };
    hub.unsubscribe(event.sender.id, parsed.data.rootPath);
    return { ok: true as const };
  });

  ipcMain.handle("fs:read-scratch-tail", async (_event, args: unknown) => {
    const parsed = ScratchTailArgsSchema.safeParse(args);
    if (!parsed.success || !path.isAbsolute(parsed.data.rootPath)) {
      return { ok: false as const, reason: "invalid" as const, stderr: "Invalid scratch preview request." };
    }
    try {
      if (!(await isKnownRoot(parsed.data.rootPath))) {
        return { ok: false as const, reason: "invalid" as const, stderr: "Not a known workspace folder." };
      }
      return { ok: true as const, ...(await readWorkspaceScratchTail(parsed.data)) };
    } catch (error) {
      if (error instanceof WorkspaceScratchFileMissingError) {
        return { ok: false as const, reason: "missing" as const, stderr: error.message };
      }
      if (error instanceof WorkspaceScratchRefusedError) {
        return { ok: false as const, reason: "invalid" as const, stderr: error.message };
      }
      return { ok: false as const, reason: "unreadable" as const, stderr: String(error) };
    }
  });

  return hub;
}
