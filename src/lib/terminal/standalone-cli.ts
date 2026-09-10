import type { ProviderId } from "@/lib/providers/provider.types";
import {
  buildTerminalSessionSlotKey,
  getWorkspaceCliSessionTabKey,
} from "@/lib/terminal/types";

/**
 * Standalone CLI has no workspace, so it borrows the workspace slot of the
 * shared CLI session identity with a sentinel value. Real workspace ids are
 * only "", "base", "base:<hash>" and "worktree:<hash>" with a [0-9a-z] hash
 * alphabet, so this literal cannot prefix-collide in either direction. That is
 * what keeps workspace archival and project deletion — both of which close
 * sessions by `cli:<workspaceId>:` prefix — from ever touching this surface.
 */
export const STANDALONE_CLI_WORKSPACE_ID = "standalone-cli";

/**
 * One tab per `ProviderId`. `STANDALONE_CLI_TAB_TITLE` below is the compile-time
 * guard: adding a `ProviderId` breaks typecheck here until the new provider gets
 * a tab, a launch spec in `electron/host-service/cli-session-launch.ts`, and a
 * `buildCliSessionRuntimeOptions` branch. See
 * `docs/developer/adding-a-provider.md` for the full checklist.
 */
export const STANDALONE_CLI_TAB_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const satisfies readonly ProviderId[];

/**
 * Transcript scrollback for this surface only. Entries are keyed by tab key,
 * which carries no folder, so the whole key has to be dropped whenever the
 * configured folder changes (see `adoptFolder` in the standalone CLI store).
 * Lives here rather than in the component so the store can clear it without
 * importing UI.
 */
export const STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY =
  "stave:standalone-cli-transcript:v1";

export type StandaloneCliTabId = (typeof STANDALONE_CLI_TAB_IDS)[number];

export interface StandaloneCliTab {
  id: StandaloneCliTabId;
  title: string;
  cwd: string;
  nativeSessionId?: string;
}

const STANDALONE_CLI_TAB_TITLE: Record<ProviderId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  kiro: "Kiro",
};

export const STANDALONE_CLI_SLOT_PREFIX = buildTerminalSessionSlotKey({
  surface: "cli",
  workspaceId: STANDALONE_CLI_WORKSPACE_ID,
  tabId: "",
});

export function getStandaloneCliTabKey(tabId: StandaloneCliTabId) {
  return getWorkspaceCliSessionTabKey({
    workspaceId: STANDALONE_CLI_WORKSPACE_ID,
    cliSessionTabId: tabId,
  });
}

export function getStandaloneCliTabTitle(tabId: StandaloneCliTabId) {
  return STANDALONE_CLI_TAB_TITLE[tabId];
}

export function buildStandaloneCliSlotKey(tabId: StandaloneCliTabId) {
  return buildTerminalSessionSlotKey({
    surface: "cli",
    workspaceId: STANDALONE_CLI_WORKSPACE_ID,
    tabId,
  });
}

export function buildStandaloneCliTabs(args: {
  folderPath: string;
  nativeSessionIdByTab: Partial<Record<StandaloneCliTabId, string>>;
}): StandaloneCliTab[] {
  return STANDALONE_CLI_TAB_IDS.map((tabId) => ({
    id: tabId,
    title: STANDALONE_CLI_TAB_TITLE[tabId],
    cwd: args.folderPath,
    ...(args.nativeSessionIdByTab[tabId]
      ? { nativeSessionId: args.nativeSessionIdByTab[tabId] }
      : {}),
  }));
}
