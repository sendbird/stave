import { buildTerminalSessionSlotKey } from "@/lib/terminal/types";

/**
 * Best-effort backend PTY cleanup for a closed terminal tab.
 *
 * The normal close path (tab chrome → store → mounted surface) disposes the
 * session through the surface's session manager. When Dockview removes the
 * panel first (drag-out close, group close), the surface has already
 * unmounted — and unmount only detaches — so the pane host mirrors the close
 * into the store and calls this to shut the backend session down by slot key.
 */
export async function closeTerminalSessionForTab(args: {
  workspaceId: string;
  terminalTabId: string;
}): Promise<void> {
  const terminalApi = window.api?.terminal;
  if (!terminalApi?.getSlotState || !terminalApi.closeSession) {
    return;
  }
  try {
    const slotState = await terminalApi.getSlotState({
      slotKey: buildTerminalSessionSlotKey({
        surface: "terminal",
        workspaceId: args.workspaceId,
        tabId: args.terminalTabId,
      }),
    });
    if (slotState.sessionId) {
      await terminalApi.closeSession({ sessionId: slotState.sessionId });
    }
  } catch {
    // Cleanup is best-effort; an orphaned background session is reclaimed
    // when the host service shuts down.
  }
}
