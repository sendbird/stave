import { useEffect } from "react";
import { installRemoteControlResponder } from "@/lib/remote-control-responder";

/**
 * Lets a paired phone read status and answer requests through this window.
 * Mounted once in the shell; main forwards nothing until it has said ready.
 */
export function RemoteControlResponder() {
  useEffect(() => installRemoteControlResponder(window.api?.remoteControl), []);
  return null;
}
