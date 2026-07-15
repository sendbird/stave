export type Osc133Status =
  "prompt-start" | "command-start" | "command-finished" | "prompt-end";

export interface Osc133Event {
  status: Osc133Status;
  exitCode?: number;
}

const OSC_133_PATTERN =
  /\x1b\]133;([ABCD])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g;
const OSC_133_PREFIX = "\x1b]133;";
type Osc133Marker = "A" | "B" | "C" | "D";

function parseCompletedOsc133Events(data: string): Osc133Event[] {
  const events: Osc133Event[] = [];
  for (const match of data.matchAll(OSC_133_PATTERN)) {
    const marker = match[1] as Osc133Marker;
    switch (marker) {
      case "A":
        events.push({ status: "prompt-start" });
        break;
      case "B":
        events.push({ status: "prompt-end" });
        break;
      case "C":
        events.push({ status: "command-start" });
        break;
      case "D": {
        const exitCode =
          match[2] === undefined ? Number.NaN : Number.parseInt(match[2], 10);
        events.push({
          status: "command-finished",
          ...(Number.isFinite(exitCode) ? { exitCode } : {}),
        });
        break;
      }
    }
  }
  return events;
}

/** Parse completed OSC 133 shell integration markers from one PTY chunk. */
export function parseOsc133Events(data: string): Osc133Event[] {
  return parseCompletedOsc133Events(data);
}

function findIncompleteOsc133Start(data: string) {
  const markerStart = data.lastIndexOf(OSC_133_PREFIX);
  if (markerStart >= 0) {
    const markerTail = data.slice(markerStart);
    if (!/(?:\x07|\x1b\\)/.test(markerTail)) {
      return markerStart;
    }
  }

  for (
    let prefixLength = Math.min(OSC_133_PREFIX.length - 1, data.length);
    prefixLength > 0;
    prefixLength -= 1
  ) {
    if (data.endsWith(OSC_133_PREFIX.slice(0, prefixLength))) {
      return data.length - prefixLength;
    }
  }
  return -1;
}

/** Retains incomplete markers so PTY chunk boundaries do not drop status. */
export class Osc133Parser {
  private carry = "";

  push(data: string): Osc133Event[] {
    const combined = this.carry + data;
    const incompleteStart = findIncompleteOsc133Start(combined);
    const complete =
      incompleteStart >= 0 ? combined.slice(0, incompleteStart) : combined;
    this.carry = incompleteStart >= 0 ? combined.slice(incompleteStart) : "";
    if (this.carry.length > 4096) {
      this.carry = "";
    }
    return parseCompletedOsc133Events(complete);
  }
}
