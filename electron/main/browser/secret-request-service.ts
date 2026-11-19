import { BrowserWindow } from "electron";
import {
  SECRET_REQUEST_IPC,
  type SecretRequestsChangedEvent,
} from "../../../src/lib/secrets/secret-request";
import { listSecrets, upsertSecret } from "./secret-service";
import { SecretRequestBroker } from "./secret-request-broker";

let broker: SecretRequestBroker | null = null;
const changeListeners = new Set<() => void>();

/** Called after a secret request card opens or settles. */
export function onSecretRequestsChanged(listener: () => void) {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

/**
 * The app's one broker. Changes go to Stave's own windows only, never to Lens
 * guest pages, and carry request metadata only.
 */
export function getSecretRequestBroker(): SecretRequestBroker {
  broker ??= new SecretRequestBroker({
    listSecrets,
    upsertSecret,
    publish: (requests) => {
      const payload: SecretRequestsChangedEvent = { requests };
      for (const window of BrowserWindow.getAllWindows()) {
        const contents = window.webContents;
        if (!contents.isDestroyed()) contents.send(SECRET_REQUEST_IPC.changed, payload);
      }
      for (const listener of changeListeners) listener();
    },
  });
  return broker;
}
