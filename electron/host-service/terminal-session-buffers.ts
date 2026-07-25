/**
 * Bounded output buffers and backpressure logging for host-service terminal
 * sessions.
 *
 * Extracted verbatim from `terminal-runtime.ts` to keep that file within the
 * max-lines ratchet; no behavior changed. Note the split of responsibility: the
 * byte accounting lives here, while the ACK high/low-water pause/resume decision
 * (the `terminal-output-flow-control` reliability gate) stays in
 * `terminal-runtime.ts` alongside the PTY handle.
 */
import {
  byteLengthUtf8,
  takeUtf8PrefixByBytes,
  takeUtf8SuffixByBytes,
} from "../shared/bounded-text";
import type { TerminalSessionEntry } from "./terminal-session-entry";

const TERMINAL_PUSH_BACKLOG_LOG_INTERVAL_MS = 2_000;
const TERMINAL_BACKGROUND_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const TERMINAL_OUTPUT_CHUNKS_MAX_BYTES = 2 * 1024 * 1024;
const TERMINAL_PENDING_PUSH_MAX_BYTES = 2 * 1024 * 1024;

export function logTerminalPushBackpressure(message: string) {
  process.stderr.write(`[terminal:push-backpressure] ${message}\n`);
}

export function bufferPendingPushOutput(session: TerminalSessionEntry) {
  drainPendingPush({
    session,
    append: (chunk) => appendOutputChunk(session, chunk),
  });
}

export function appendBounded(
  buffer: string[],
  tracker: { bytes: number },
  data: string,
  maxBytes: number,
) {
  let nextData = data;
  const nextDataBytes = byteLengthUtf8(nextData);
  if (nextDataBytes > maxBytes) {
    nextData = takeUtf8SuffixByBytes({
      value: nextData,
      maxBytes,
    }).suffix;
    buffer.length = 0;
    tracker.bytes = 0;
  }

  buffer.push(nextData);
  tracker.bytes += byteLengthUtf8(nextData);
  while (tracker.bytes > maxBytes && buffer.length > 0) {
    const removed = buffer.shift()!;
    tracker.bytes -= byteLengthUtf8(removed);
  }
}

export function appendBackgroundBuffer(session: TerminalSessionEntry, data: string) {
  appendBounded(
    session.backgroundBuffer,
    {
      get bytes() {
        return session.backgroundBufferBytes;
      },
      set bytes(v) {
        session.backgroundBufferBytes = v;
      },
    },
    data,
    TERMINAL_BACKGROUND_BUFFER_MAX_BYTES,
  );
}

export function appendOutputChunk(session: TerminalSessionEntry, data: string) {
  appendBounded(
    session.outputChunks,
    {
      get bytes() {
        return session.outputChunksBytes;
      },
      set bytes(v) {
        session.outputChunksBytes = v;
      },
    },
    data,
    TERMINAL_OUTPUT_CHUNKS_MAX_BYTES,
  );
}

export function appendPendingPush(session: TerminalSessionEntry, data: string) {
  appendBounded(
    session.pendingPush,
    {
      get bytes() {
        return session.pendingPushBytes;
      },
      set bytes(v) {
        session.pendingPushBytes = v;
      },
    },
    data,
    TERMINAL_PENDING_PUSH_MAX_BYTES,
  );
}

export function drainPendingPush(args: {
  session: TerminalSessionEntry;
  append: (chunk: string) => void;
}) {
  const { session } = args;
  while (session.pendingPush.length > 0) {
    const nextChunk = session.pendingPush.shift();
    if (!nextChunk) {
      continue;
    }
    session.pendingPushBytes = Math.max(
      0,
      session.pendingPushBytes - byteLengthUtf8(nextChunk),
    );
    args.append(nextChunk);
  }
  session.pushScheduled = false;
}

export function shiftBoundedOutput(args: { chunks: string[]; maxBytes: number }) {
  if (args.maxBytes <= 0 || args.chunks.length === 0) {
    return { output: "", bytes: 0 };
  }

  let remainingBytes = args.maxBytes;
  let output = "";

  while (args.chunks.length > 0 && remainingBytes > 0) {
    const nextChunk = args.chunks[0] ?? "";
    const nextChunkBytes = byteLengthUtf8(nextChunk);
    if (nextChunkBytes <= remainingBytes) {
      output += args.chunks.shift()!;
      remainingBytes -= nextChunkBytes;
      continue;
    }

    const { prefix, rest } = takeUtf8PrefixByBytes({
      value: nextChunk,
      maxBytes: remainingBytes,
    });
    if (!prefix) {
      break;
    }
    output += prefix;
    args.chunks[0] = rest;
    remainingBytes -= byteLengthUtf8(prefix);
    break;
  }

  return {
    output,
    bytes: args.maxBytes - remainingBytes,
  };
}

export function drainBackgroundBuffer(session: TerminalSessionEntry): string {
  if (session.backgroundBuffer.length === 0) {
    return "";
  }
  const backlog = session.backgroundBuffer.join("");
  session.backgroundBuffer.length = 0;
  session.backgroundBufferBytes = 0;
  return backlog;
}

export function maybeLogTerminalBackpressure(args: {
  session: TerminalSessionEntry;
  sessionId: string;
  reason: string;
  flushedBytes?: number;
}) {
  const now = Date.now();
  if (
    now - args.session.lastBackpressureLogAt <
    TERMINAL_PUSH_BACKLOG_LOG_INTERVAL_MS
  ) {
    return;
  }
  args.session.lastBackpressureLogAt = now;
  args.session.backlogWarningActive = true;
  const flushedSuffix =
    typeof args.flushedBytes === "number"
      ? ` flushedBytes=${args.flushedBytes}`
      : "";
  logTerminalPushBackpressure(
    `reason=${args.reason} session=${args.sessionId} slot=${args.session.slotKey ?? "none"} deliveryMode=${args.session.deliveryMode} pendingChunks=${args.session.pendingPush.length} pendingBytes=${args.session.pendingPushBytes} peakPendingBytes=${args.session.peakPendingPushBytes}${flushedSuffix}`,
  );
}

export function maybeLogTerminalRecovery(args: {
  session: TerminalSessionEntry;
  sessionId: string;
}) {
  if (
    !args.session.backlogWarningActive ||
    args.session.pendingPushBytes > 0
  ) {
    return;
  }
  args.session.backlogWarningActive = false;
  logTerminalPushBackpressure(
    `reason=drained session=${args.sessionId} slot=${args.session.slotKey ?? "none"} peakPendingBytes=${args.session.peakPendingPushBytes}`,
  );
}
