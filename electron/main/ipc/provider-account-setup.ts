import { ipcMain } from "electron";
import type { ClaudeMcpStatusResponse } from "../../../src/lib/providers/provider.types";
import {
  CheckMcpConnectionsArgsSchema,
  type CheckMcpConnectionsResult,
  PROVIDER_ACCOUNT_SETUP_IPC,
  ProviderAccountSetupStatusArgsSchema,
  ProviderAccountMcpOptionsArgsSchema,
  ProviderAccountShareSetupArgsSchema,
  type ProviderAccountSetupResult,
  type ProviderAccountSetupState,
} from "../../../src/lib/providers/provider-account-setup";
import { NEVER_SHARED_MCP_SERVER_NAMES } from "../../provider-accounts/shared-mcp";
import { readClaudeAccountMcpStatus, recordClaudeAccountMcpStatus } from "../../provider-accounts/mcp-status-cache";
import { listMcpDelegationAccounts } from "../../provider-accounts/mcp-delegation";
import { getProviderAccountRegistry, systemDirectory } from "../../provider-accounts/registry";
import {
  applyAccountMcpOptions,
  applySetupSharing,
  readSetupSharing,
  removeSetupSharing,
  type SetupSharingTarget,
} from "../../provider-accounts/setup-sharing";

const fail = (message: string): ProviderAccountSetupResult => ({ ok: false, message });

/** Adds what the account's MCP delegation would hand over; names only, and nothing when the accounts cannot be read. */
function withDelegableServers(
  setup: ProviderAccountSetupState,
  id: string,
  resolveSystemDirectory: (providerId: SetupSharingTarget["providerId"]) => string,
): ProviderAccountSetupState {
  if (!setup.mcp) return setup;
  try {
    const registry = getProviderAccountRegistry();
    const reading = (profileId: string) => readClaudeAccountMcpStatus(profileId);
    const delegable = listMcpDelegationAccounts(id, {
      profiles: registry.list(),
      resolveDirectory: (profileId) => registry.resolveDirectory({ providerId: "claude-code", profileId }),
      connectedServers: (profileId) => reading(profileId)?.connected ?? null,
      systemDirectory: () => resolveSystemDirectory("claude-code"),
      // A handler given its own System default folder (tests) reads shared servers from it too.
      ...(resolveSystemDirectory === systemDirectory ? {} : { sharedSystemConfigDir: () => resolveSystemDirectory("claude-code") }),
    }, { preview: true, includeEmpty: true }).map(({ id, label, servers }) => ({ id, label, servers, observedAt: reading(id)?.observedAt ?? null }));
    return { ...setup, mcp: { ...setup.mcp, delegable } };
  } catch {
    return setup;
  }
}

/** Only app-managed folders take part: a folder the user registered is theirs to arrange. */
function resolveTarget(
  args: { providerId: SetupSharingTarget["providerId"]; id: string },
  resolveSystemDirectory: (providerId: SetupSharingTarget["providerId"]) => string,
): SetupSharingTarget | string {
  const registry = getProviderAccountRegistry();
  const profile = registry.list().find((candidate) => candidate.providerId === args.providerId && candidate.id === args.id);
  if (!profile) return "The provider account no longer exists.";
  if (profile.kind !== "managed" || profile.gateway) return "Only accounts Stave created can share the System default setup.";
  const profileDir = registry.resolveDirectory({ providerId: args.providerId, profileId: args.id });
  if (!profileDir) return "The provider account could not be resolved.";
  return { providerId: args.providerId, sourceDir: resolveSystemDirectory(args.providerId), profileDir };
}

/**
 * `provider-accounts:setup-status` reads what an account shares from System
 * default. `provider-accounts:share-setup` turns that on (and refreshes the
 * copied settings) or off. `provider-accounts:mcp-options` changes the
 * account's MCP choices. Replies carry entry names, labels and states only.
 */
async function probeMcpConnections(profileId: string, claudeBinaryPath?: string): Promise<ClaudeMcpStatusResponse> {
  const { invokeHostService } = await import("../host-service-client");
  return invokeHostService("provider.get-claude-mcp-status", {
    waitForConnections: true,
    runtimeOptions: { claudeAccountProfileId: profileId, claudeBinaryPath, claudeSettingSources: ["user"] },
  });
}

export function registerProviderAccountSetupHandlers(
  resolveSystemDirectory: (providerId: SetupSharingTarget["providerId"]) => string = systemDirectory,
  probe = probeMcpConnections,
) {
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.checkMcpConnections, async (_event, input: unknown): Promise<CheckMcpConnectionsResult> => {
    const parsed = CheckMcpConnectionsArgsSchema.safeParse(input);
    if (!parsed.success) return { ok: false };
    const { profileId, claudeBinaryPath } = parsed.data;
    try {
      const registry = getProviderAccountRegistry();
      const exists = () => registry.list().some((profile) => profile.providerId === "claude-code" && profile.id === profileId && !profile.gateway);
      if (!exists()) return { ok: false };
      const result = await probe(profileId, claudeBinaryPath);
      if (!result.ok || !exists()) return { ok: false };
      const servers = result.servers.flatMap(({ name, status }) =>
        NEVER_SHARED_MCP_SERVER_NAMES.has(name) || status === "disabled"
          ? []
          : [{ name, status: status === "pending" ? "failed" as const : status }],
      );
      recordClaudeAccountMcpStatus(profileId, servers, result.checkedAt, { authoritative: true });
      return { ok: true, servers };
    } catch {
      return { ok: false };
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.setupStatus, (_event, input: unknown): ProviderAccountSetupResult => {
    const parsed = ProviderAccountSetupStatusArgsSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid provider account details.");
    try {
      const target = resolveTarget(parsed.data, resolveSystemDirectory);
      return typeof target === "string"
        ? fail(target)
        : { ok: true, setup: withDelegableServers(readSetupSharing(target), parsed.data.id, resolveSystemDirectory) };
    } catch {
      return fail("Shared setup is unavailable.");
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.shareSetup, (_event, input: unknown): ProviderAccountSetupResult => {
    const parsed = ProviderAccountShareSetupArgsSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid provider account details.");
    try {
      const target = resolveTarget(parsed.data, resolveSystemDirectory);
      if (typeof target === "string") return fail(target);
      const setup = parsed.data.enabled
        ? applySetupSharing(target, { settingsMode: parsed.data.settingsMode })
        : removeSetupSharing(target);
      return { ok: true, setup: withDelegableServers(setup, parsed.data.id, resolveSystemDirectory) };
    } catch (error) {
      // The messages thrown by the sharing code are fixed text with no paths.
      return fail(error instanceof Error && /^(This account|The account folder)/.test(error.message) ? error.message : "Could not update the shared setup.");
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.mcpOptions, (_event, input: unknown): ProviderAccountSetupResult => {
    const parsed = ProviderAccountMcpOptionsArgsSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid provider account details.");
    try {
      const target = resolveTarget(parsed.data, resolveSystemDirectory);
      if (typeof target === "string") return fail(target);
      const { useSystemMcp, delegateMcpWork } = parsed.data;
      const setup = applyAccountMcpOptions(target, {
        ...(useSystemMcp === undefined ? {} : { useSystemMcp }),
        ...(delegateMcpWork === undefined ? {} : { delegateMcpWork }),
      });
      return { ok: true, setup: withDelegableServers(setup, parsed.data.id, resolveSystemDirectory) };
    } catch (error) {
      return fail(error instanceof Error && /^(This account|The account folder)/.test(error.message) ? error.message : "Could not update the MCP options.");
    }
  });
}
