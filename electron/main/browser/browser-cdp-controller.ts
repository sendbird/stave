import { webContents } from "electron";
import {
  createCdpCommandBarrier,
  type CdpCommandBarrier,
} from "./browser-cdp-close-barrier";

export type CdpMessageListener = (
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
) => void;

export type CdpDetachListener = (reason: string) => void;

interface CdpControllerState {
  webContentsId: number;
  attachedByController: boolean;
  commandBarrier: CdpCommandBarrier;
  detachRequested: boolean;
  messageListeners: Set<CdpMessageListener>;
  detachListeners: Set<CdpDetachListener>;
  onMessage: (
    event: Electron.Event,
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ) => void;
  onDetach: (event: Electron.Event, reason: string) => void;
  onDestroyed: () => void;
}

const controllers = new Map<number, CdpControllerState>();
const disposedWebContentsIds = new Set<number>();
const CDP_CLOSE_DRAIN_TIMEOUT_MS = 1_000;
let closeDrainTimeouts = 0;

function assertControllerNotDisposed(webContentsId: number): void {
  if (disposedWebContentsIds.has(webContentsId)) {
    throw new Error(`WebContents ${webContentsId} is closing`);
  }
}

function requireWebContents(webContentsId: number): Electron.WebContents {
  assertControllerNotDisposed(webContentsId);
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error(`WebContents ${webContentsId} not found or destroyed`);
  }
  return wc;
}

function clearController(
  state: CdpControllerState,
  removeDebuggerListeners: boolean,
) {
  const wc = webContents.fromId(state.webContentsId);
  if (wc && !wc.isDestroyed()) {
    if (removeDebuggerListeners) {
      wc.debugger.off("message", state.onMessage);
      wc.debugger.off("detach", state.onDetach);
    }
    wc.off("destroyed", state.onDestroyed);
  }
  controllers.delete(state.webContentsId);
  state.messageListeners.clear();
  state.detachListeners.clear();
}

function notifyDetachListeners(
  state: CdpControllerState,
  reason: string,
): void {
  for (const listener of [...state.detachListeners]) {
    try {
      listener(reason);
    } catch (error) {
      console.warn("[lens:cdp] detach listener failed", error);
    }
  }
}

function getOrCreateController(webContentsId: number): CdpControllerState {
  const existing = controllers.get(webContentsId);
  if (existing) {
    return existing;
  }

  const wc = requireWebContents(webContentsId);
  const state = {} as CdpControllerState;
  state.webContentsId = webContentsId;
  state.attachedByController = false;
  state.commandBarrier = createCdpCommandBarrier();
  state.detachRequested = false;
  state.messageListeners = new Set();
  state.detachListeners = new Set();
  state.onMessage = (_event, method, params, sessionId) => {
    for (const listener of state.messageListeners) {
      try {
        listener(method, params, sessionId);
      } catch (error) {
        console.warn("[lens:cdp] message listener failed", error);
      }
    }
  };
  state.onDetach = (_event, reason) => {
    state.commandBarrier.finishClose();
    notifyDetachListeners(state, reason);
    clearController(state, true);
  };
  state.onDestroyed = () => {
    state.commandBarrier.finishClose();
    notifyDetachListeners(state, "web-contents-destroyed");
    clearController(state, false);
  };

  wc.debugger.on("message", state.onMessage);
  wc.debugger.on("detach", state.onDetach);
  wc.once("destroyed", state.onDestroyed);
  controllers.set(webContentsId, state);
  return state;
}

function finalizeControllerDetach(state: CdpControllerState): void {
  state.detachRequested = false;
  const wc = webContents.fromId(state.webContentsId);
  if (wc && !wc.isDestroyed()) {
    wc.debugger.off("message", state.onMessage);
    wc.debugger.off("detach", state.onDetach);
    wc.off("destroyed", state.onDestroyed);
    if (state.attachedByController && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach();
      } catch (error) {
        console.warn("[lens:cdp] debugger detach failed", error);
      }
    }
  }
  clearController(state, false);
}

function releaseCommandLease(state: CdpControllerState): void {
  if (
    state.detachRequested &&
    state.commandBarrier.snapshot().inFlightCommands === 0
  ) {
    finalizeControllerDetach(state);
  }
}

export function ensureCdpAttached(webContentsId: number): void {
  const wc = requireWebContents(webContentsId);
  const controller = getOrCreateController(webContentsId);
  if (!wc.debugger.isAttached()) {
    try {
      wc.debugger.attach("1.3");
      controller.attachedByController = true;
    } catch (error) {
      clearController(controller, true);
      throw error;
    }
  }
}

export async function sendCdpCommand(
  webContentsId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  ensureCdpAttached(webContentsId);
  const controller = getOrCreateController(webContentsId);
  const release = controller.commandBarrier.acquire();
  try {
    return await requireWebContents(webContentsId).debugger.sendCommand(
      method,
      params,
    );
  } finally {
    release();
    releaseCommandLease(controller);
  }
}

/**
 * Send cleanup work only when CDP is already attached. Unlike sendCdpCommand,
 * this never creates a controller or re-attaches after navigation/detach.
 */
export async function sendCdpCommandIfAttached(
  webContentsId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown | undefined> {
  if (disposedWebContentsIds.has(webContentsId)) {
    return undefined;
  }
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || !wc.debugger.isAttached()) {
    return undefined;
  }
  const controller = controllers.get(webContentsId);
  if (!controller) {
    return wc.debugger.sendCommand(method, params);
  }
  const release = controller.commandBarrier.acquire();
  try {
    return await wc.debugger.sendCommand(method, params);
  } finally {
    release();
    releaseCommandLease(controller);
  }
}

export function subscribeCdpMessages(
  webContentsId: number,
  listener: CdpMessageListener,
): () => void {
  ensureCdpAttached(webContentsId);
  const controller = getOrCreateController(webContentsId);
  controller.detachRequested = false;
  controller.messageListeners.add(listener);
  return () => controller.messageListeners.delete(listener);
}

export function subscribeCdpDetach(
  webContentsId: number,
  listener: CdpDetachListener,
): () => void {
  ensureCdpAttached(webContentsId);
  const controller = getOrCreateController(webContentsId);
  controller.detachRequested = false;
  controller.detachListeners.add(listener);
  return () => controller.detachListeners.delete(listener);
}

export function detachCdpController(
  webContentsId: number,
  options?: { force?: boolean },
): void {
  const controller = controllers.get(webContentsId);
  if (controller) {
    if (
      !options?.force &&
      controller.attachedByController &&
      controller.commandBarrier.snapshot().inFlightCommands > 0
    ) {
      controller.detachRequested = true;
      return;
    }
    finalizeControllerDetach(controller);
  }
}

/** Permanently reject new CDP work while a WebContents is closing. */
export async function disposeCdpController(
  webContentsId: number,
): Promise<"drained" | "timed-out"> {
  const wc = webContents.fromId(webContentsId);
  let isAlive = false;
  try {
    isAlive = Boolean(wc && !wc.isDestroyed());
  } catch {
    // Treat an unreadable wrapper as alive and keep the id tombstoned.
    isAlive = Boolean(wc);
  }
  if (wc && isAlive) {
    if (!disposedWebContentsIds.has(webContentsId)) {
      disposedWebContentsIds.add(webContentsId);
      try {
        wc.once("destroyed", () => {
          disposedWebContentsIds.delete(webContentsId);
        });
      } catch {
        // Keep the tombstone when destruction cannot be observed safely.
      }
    }
  } else {
    disposedWebContentsIds.delete(webContentsId);
  }
  const controller = controllers.get(webContentsId);
  if (!controller) {
    return "drained";
  }

  // Do not explicitly detach the debugger during WebContents teardown. A
  // timed-out caller can leave a native CDP command alive after its JS promise
  // is abandoned; detach + close in the same stack is a known crash shape.
  controller.detachRequested = false;
  const result = await controller.commandBarrier.beginClose(
    CDP_CLOSE_DRAIN_TIMEOUT_MS,
  );
  if (result === "timed-out") {
    closeDrainTimeouts += 1;
  }
  return result;
}

export function getCdpControllerResourceMetrics(): {
  controllers: number;
  closingControllers: number;
  inFlightCommands: number;
  closeDrainTimeouts: number;
} {
  const snapshots = [...controllers.values()].map((controller) =>
    controller.commandBarrier.snapshot(),
  );
  return {
    controllers: snapshots.length,
    closingControllers: snapshots.filter((snapshot) => snapshot.closing).length,
    inFlightCommands: snapshots.reduce(
      (total, snapshot) => total + snapshot.inFlightCommands,
      0,
    ),
    closeDrainTimeouts,
  };
}

/** Native CDP commands currently running for one guest. */
export function getCdpInFlightCommandCount(webContentsId: number): number {
  return (
    controllers.get(webContentsId)?.commandBarrier.snapshot()
      .inFlightCommands ?? 0
  );
}

export function isCdpAttached(webContentsId: number): boolean {
  const wc = webContents.fromId(webContentsId);
  return Boolean(wc && !wc.isDestroyed() && wc.debugger.isAttached());
}
