import { webContents } from "electron";

export type CdpMessageListener = (
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
) => void;

export type CdpDetachListener = (reason: string) => void;

interface CdpControllerState {
  webContentsId: number;
  attachedByController: boolean;
  inFlightCommands: number;
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

function requireWebContents(webContentsId: number): Electron.WebContents {
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
  state.inFlightCommands = 0;
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
    notifyDetachListeners(state, reason);
    clearController(state, true);
  };
  state.onDestroyed = () => {
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
  state.inFlightCommands = Math.max(0, state.inFlightCommands - 1);
  if (state.detachRequested && state.inFlightCommands === 0) {
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
  controller.inFlightCommands += 1;
  try {
    return await requireWebContents(webContentsId).debugger.sendCommand(
      method,
      params,
    );
  } finally {
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
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed() || !wc.debugger.isAttached()) {
    return undefined;
  }
  const controller = controllers.get(webContentsId);
  if (!controller) {
    return wc.debugger.sendCommand(method, params);
  }
  controller.inFlightCommands += 1;
  try {
    return await wc.debugger.sendCommand(method, params);
  } finally {
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

export function detachCdpController(webContentsId: number): void {
  const controller = controllers.get(webContentsId);
  if (controller) {
    if (controller.attachedByController && controller.inFlightCommands > 0) {
      controller.detachRequested = true;
      return;
    }
    finalizeControllerDetach(controller);
  }
}

export function isCdpAttached(webContentsId: number): boolean {
  const wc = webContents.fromId(webContentsId);
  return Boolean(wc && !wc.isDestroyed() && wc.debugger.isAttached());
}
