import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  SECRET_REQUEST_IPC,
  type SecretRequestListResult,
  type SecretRequestRespondResult,
} from "../../../src/lib/secrets/secret-request";
import { getSecretRequestBroker } from "../browser/secret-request-service";
import { isTrustedLensRenderer } from "./lens-ipc-authorization";
import { SecretRequestRespondArgsSchema } from "./secret-request-schemas";

/**
 * Only a Stave window's main frame may read or answer requests: a Lens guest
 * page or an iframe has no business seeing which secrets an agent asked for,
 * let alone supplying one.
 */
function isStaveWindowSender(event: IpcMainInvokeEvent) {
  return isTrustedLensRenderer(event, BrowserWindow.fromWebContents(event.sender)?.webContents);
}

/**
 * The card's half of `stave_request_secret`. The value arrives here, goes
 * straight to the vault through the broker, and is never echoed back.
 */
export function registerSecretRequestHandlers() {
  ipcMain.handle(SECRET_REQUEST_IPC.list, (event): SecretRequestListResult => {
    if (!isStaveWindowSender(event)) return { ok: false, requests: [] };
    return { ok: true, requests: getSecretRequestBroker().list() };
  });

  ipcMain.handle(
    SECRET_REQUEST_IPC.respond,
    async (event, args: unknown): Promise<SecretRequestRespondResult> => {
      if (!isStaveWindowSender(event)) return { ok: false, reason: "invalid" };
      const parsed = SecretRequestRespondArgsSchema.safeParse(args);
      // The parse error would quote the payload, which may hold the value.
      if (!parsed.success) return { ok: false, reason: "invalid" };
      return getSecretRequestBroker().respond(parsed.data);
    },
  );
}
