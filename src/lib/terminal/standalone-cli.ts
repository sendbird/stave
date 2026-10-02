import { selectedProviderAccount, type ProviderAccountSelection } from "@/lib/providers/provider-account-selection";
import {
  isOptionalProvider,
  providerConfigurationKey,
  type OptionalProviderId,
} from "@/lib/providers/provider-readiness";
import type { ProviderReadiness } from "@/lib/providers/provider-readiness-store";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
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
  accountProfileId?: string;
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

/**
 * A pinned account wins. A resumable tab with no pin predates account
 * switching and was launched under the system account, so it stays there.
 */
export function resolveStandaloneCliTabAccountProfileId(args: {
  tabId: StandaloneCliTabId;
  nativeSessionId?: string;
  pinnedAccountProfileId?: string;
  defaults?: ProviderAccountSelection;
}) {
  return (
    args.pinnedAccountProfileId ??
    (args.nativeSessionId
      ? "system-default"
      : selectedProviderAccount(args.tabId, args.defaults))
  );
}

export function buildStandaloneCliTab(args: {
  tabId: StandaloneCliTabId;
  folderPath: string;
  nativeSessionId?: string;
  accountProfileId: string;
}): StandaloneCliTab {
  return {
    id: args.tabId,
    title: STANDALONE_CLI_TAB_TITLE[args.tabId],
    accountProfileId: args.accountProfileId,
    cwd: args.folderPath,
    ...(args.nativeSessionId ? { nativeSessionId: args.nativeSessionId } : {}),
  };
}

export function buildStandaloneCliTabs(args: {
  folderPath: string;
  nativeSessionIdByTab: Partial<Record<StandaloneCliTabId, string>>;
  accountProfileIdByTab?: Partial<Record<StandaloneCliTabId, string>>;
  defaults?: ProviderAccountSelection;
}): StandaloneCliTab[] {
  return STANDALONE_CLI_TAB_IDS.map((tabId) =>
    buildStandaloneCliTab({
      tabId,
      folderPath: args.folderPath,
      nativeSessionId: args.nativeSessionIdByTab[tabId],
      accountProfileId: resolveStandaloneCliTabAccountProfileId({
        tabId,
        nativeSessionId: args.nativeSessionIdByTab[tabId],
        pinnedAccountProfileId: args.accountProfileIdByTab?.[tabId],
        defaults: args.defaults,
      }),
    }),
  );
}

/**
 * Only a CLI that is actually on this machine gets a tab. Claude Code and
 * Codex report through `providerAvailability`, which starts optimistic so the
 * common tabs do not flicker away before the first probe. Cursor and Kiro
 * start hidden and appear once their tooling probe has resolved an executable
 * for the configured binary path; a missing login does not hide them, because
 * the CLI itself is where the user signs in.
 */
export function listInstalledStandaloneCliTabIds(args: {
  providerAvailability: Partial<Record<ProviderId, boolean>>;
  optionalProviders: Partial<Record<OptionalProviderId, ProviderReadiness>>;
  runtimeOptions?: Pick<
    ProviderRuntimeOptions,
    "cursorBinaryPath" | "kiroBinaryPath"
  >;
}): StandaloneCliTabId[] {
  return STANDALONE_CLI_TAB_IDS.filter((tabId) => {
    if (!isOptionalProvider(tabId)) {
      return args.providerAvailability[tabId] !== false;
    }
    const readiness = args.optionalProviders[tabId];
    return Boolean(
      readiness &&
        readiness.configurationKey ===
          providerConfigurationKey(tabId, args.runtimeOptions) &&
        readiness.tool.executablePath,
    );
  });
}

/**
 * The stored choice survives an uninstall so it comes back with the CLI, but
 * the surface never boots a CLI that is not there: it falls back to the first
 * installed one instead.
 */
export function resolveStandaloneCliActiveTabId(args: {
  activeTabId: StandaloneCliTabId;
  installedTabIds: readonly StandaloneCliTabId[];
}): StandaloneCliTabId {
  return args.installedTabIds.includes(args.activeTabId)
    ? args.activeTabId
    : (args.installedTabIds[0] ?? args.activeTabId);
}

/**
 * The accounts a tab can run under. Only Claude Code and Codex have accounts;
 * every other CLI signs in through its own login and gets no selector.
 */
export function listStandaloneCliAccountOptions(args: {
  tabId: StandaloneCliTabId;
  profiles: readonly ProviderAccountProfile[];
}): ProviderAccountProfile[] {
  if (args.tabId !== "claude-code" && args.tabId !== "codex") {
    return [];
  }
  return args.profiles.filter((profile) => profile.providerId === args.tabId);
}
