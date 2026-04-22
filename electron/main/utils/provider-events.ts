import type { BridgeEvent } from "../../providers/types";

export function toEventType(args: { event: BridgeEvent }) {
  return args.event.type;
}

export function isDoneEvent(args: { event: BridgeEvent }) {
  return args.event.type === "done";
}
