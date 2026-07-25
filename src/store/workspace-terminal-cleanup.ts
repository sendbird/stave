/**
 * Detach every PTY session owned by a set of workspaces.
 *
 * Extracted verbatim from `@/store/app.store` to keep the store file within the
 * max-lines ratchet; no behavior changed. Shared by the workspace-close path and
 * the detached workspace-archive cleanup.
 */
import { buildTerminalSessionSlotKey } from "@/lib/terminal/types";

export async function closeTerminalSessionsForWorkspaces(
  workspaceIds: string[],
) {
  const api = window.api?.terminal?.closeSessionsBySlotPrefix;
  if (!api || workspaceIds.length === 0) {
    return;
  }
  await Promise.allSettled(
    workspaceIds.flatMap((wsId) => [
      api({
        prefix: buildTerminalSessionSlotKey({
          surface: "terminal",
          workspaceId: wsId,
          tabId: "",
        }),
      }),
      api({
        prefix: buildTerminalSessionSlotKey({
          surface: "cli",
          workspaceId: wsId,
          tabId: "",
        }),
      }),
    ]),
  );
}
