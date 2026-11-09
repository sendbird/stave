/**
 * Tells every renderer that Tars state changed, so its surfaces read again
 * instead of polling. Two sources: the host's committed writes
 * (`tars.changed`: responsibilities, identity, receipts and click records)
 * and main's own conversation writes (messages, answers, failures).
 */
import { webContents } from "electron";
import { TARS_IPC, TarsChangedEventSchema, type TarsChangeScope } from "../../src/lib/tars/types";
import { createTarsChangeBatcher } from "../persistence/tars-changes";
import { onHostServiceEvent } from "./host-service-client";

function broadcast(scope: TarsChangeScope) {
  const event = TarsChangedEventSchema.parse({ scope });
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send(TARS_IPC.changed, event);
  }
}

/** For main's store listeners: reports each scope once, after the write commits. */
export const notifyTarsChanged = createTarsChangeBatcher(broadcast);

let bridged = false;

/** Forwards the host's `tars.changed` to every renderer; a malformed payload is dropped. */
export function ensureTarsEventBridge() {
  if (bridged) return;
  bridged = true;
  onHostServiceEvent("tars.changed", (payload) => {
    const parsed = TarsChangedEventSchema.safeParse(payload);
    if (parsed.success) broadcast(parsed.data.scope);
  });
}
