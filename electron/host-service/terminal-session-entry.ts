/**
 * Shared shapes for the host-service terminal runtime.
 *
 * Extracted verbatim from `terminal-runtime.ts` to keep that file within the
 * max-lines ratchet; no behavior changed.
 */
import type * as pty from "node-pty";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Terminal as HeadlessTerminal } from "@xterm/headless";
import type { Osc133Parser } from "../../src/lib/terminal/osc133";

export interface TerminalSessionEntry {
  pty: pty.IPty;
  dataSubscription: pty.IDisposable | null;
  exitSubscription: pty.IDisposable | null;
  headlessTerminal: HeadlessTerminal;
  serializeAddon: SerializeAddon;
  headlessDataSubscription: { dispose: () => void } | null;
  lastHeadlessWritePromise: Promise<void>;
  outputChunks: string[];
  outputChunksBytes: number;
  pendingPush: string[];
  pendingPushBytes: number;
  peakPendingPushBytes: number;
  lastBackpressureLogAt: number;
  backlogWarningActive: boolean;
  pushScheduled: boolean;
  pushWriteInFlight: boolean;
  lastPushWritePromise: Promise<void> | null;
  deliveryMode: "poll" | "push";
  closing: boolean;
  slotKey: string | null;
  closed: Promise<void>;
  close: () => void;
  disposePtyListeners: () => void;
  disposeHeadlessMirror: () => void;
  flushPushOutput: () => void;
  markClosed: () => void;
  activeAttachmentId: string | null;
  streamReadyAttachmentId: string | null;
  backgroundBuffer: string[];
  backgroundBufferBytes: number;
  exitCode: number | null;
  exitSignal: number | undefined;
  nativeSessionId: string | null;
  disposeNativeSessionDiscovery: (() => void) | null;
  outputSequence: number;
  sentOutputBytes: number;
  acknowledgedOutputBytes: number;
  flowPaused: boolean;
  persistedScreenState: string | null;
  osc133Parser: Osc133Parser;
}

export interface TerminalSnapshotPersistence {
  saveTerminalSnapshot(args: { slotKey: string; screenState: string }): void;
  loadTerminalSnapshot(args: {
    slotKey: string;
  }): { screen_state: string; updated_at: string } | undefined;
  deleteTerminalSnapshot(args: { slotKey: string }): void;
}
