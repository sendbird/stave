import { ipcMain } from "electron";
import { z } from "zod";
import { RemoteAdminResultSchema } from "../../../src/lib/remote-control";
import {
  handleRemoteControlAdmin,
  isRemoteControlSender,
  resolveRemoteControlResponse,
  setRemoteControlResponderReady,
} from "../remote-control/service";

const ReadySchema = z.object({ ready: z.boolean() }).strict();

/**
 * Remote control IPC, accepted only from the main window. `admin` carries the
 * Settings actions (strict `RemoteAdminSchema`, parsed in the runtime);
 * `respond` and `responder-ready` are the renderer half of the bridge that
 * answers a phone through the desktop's own respond actions.
 */
export function registerRemoteControlHandlers() {
  ipcMain.handle("remote-control:admin", async (event, raw: unknown) => {
    if (!isRemoteControlSender(event.sender)) {
      return RemoteAdminResultSchema.parse({ ok: false, error: "invalid-request" });
    }
    return handleRemoteControlAdmin(raw);
  });
  ipcMain.handle("remote-control:respond", async (event, raw: unknown) => {
    if (!isRemoteControlSender(event.sender)) return { ok: false };
    return resolveRemoteControlResponse(event.sender, raw);
  });
  ipcMain.handle("remote-control:responder-ready", async (event, raw: unknown) => {
    const parsed = ReadySchema.safeParse(raw);
    if (!parsed.success || !isRemoteControlSender(event.sender)) return { ok: false };
    await setRemoteControlResponderReady(event.sender, parsed.data.ready);
    return { ok: true };
  });
}
