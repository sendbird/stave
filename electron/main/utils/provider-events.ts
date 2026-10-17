import type { BridgeEvent } from "../../providers/types";

export function isDoneEvent(args: { event: BridgeEvent }) {
  return args.event.type === "done";
}
