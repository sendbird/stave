import type { LensSessionPresentationRequestPayload } from "../../../src/lib/lens/lens.types";
import {
  resolveLensAgentActivityKind,
  shouldRequestLensAgentPresentation,
  type LensAgentActivityToolName,
} from "../../../src/lib/lens/lens-agent-presentation";
import type { BrowserSessionState } from "./browser-manager";
import { getMainWindow } from "../window";

export function requestLensSessionPresentation(
  payload: LensSessionPresentationRequestPayload,
): boolean {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return false;
  }
  renderer.send("lens:present-session", payload);
  return true;
}

/**
 * Ask the renderer to attach an MCP-only session when the agent starts work
 * that is inherently visual or interactive. UI-owned sessions are left alone
 * even when their native view is currently hidden behind another tab.
 */
export function requestLensAgentActivityPresentation(
  session: BrowserSessionState,
  toolName: LensAgentActivityToolName,
): boolean {
  if (
    !shouldRequestLensAgentPresentation({
      managedByMcp: session.managedByMcp,
      toolName,
    })
  ) {
    return false;
  }
  const activityKind = resolveLensAgentActivityKind(toolName);
  if (!activityKind) {
    return false;
  }
  return requestLensSessionPresentation({
    workspaceId: session.workspaceId,
    lensSessionId: session.lensSessionId,
    requestKind: "agent-activity",
    activityKind,
    toolName,
  });
}
