import { ipcMain } from "electron";
import {
  CodexMcpDelegationPreviewArgsSchema,
  CodexMcpDelegationSettingsSchema,
  type CodexMcpDelegationPreview,
  type CodexMcpDelegationSettings,
  type CodexMcpDelegationPreviewArgs,
} from "../../../src/lib/providers/codex-mcp-delegation-settings";
import { PROVIDER_ACCOUNT_SETUP_IPC } from "../../../src/lib/providers/provider-account-setup";
import { codexMcpDelegationCandidates } from "../../provider-accounts/codex-mcp-delegation";
import { claudeSignInAccounts, currentMcpDelegationDirectory } from "../../provider-accounts/mcp-delegation";

async function getPolicyStore() {
  const { ensurePersistenceReady } = await import("../state");
  return (await ensurePersistenceReady()).delegationPolicies;
}

async function listConfiguredNames({ codexAccountProfileId, cwd, codexBinaryPath }: CodexMcpDelegationPreviewArgs) {
  const { invokeHostService } = await import("../host-service-client");
  return invokeHostService("provider.list-codex-configured-mcp-names", { cwd, runtimeOptions: { codexAccountProfileId, codexBinaryPath } });
}

export interface CodexMcpDelegationSettingsDeps {
  read: () => Promise<CodexMcpDelegationSettings>;
  save: (settings: CodexMcpDelegationSettings) => Promise<void>;
  names: typeof listConfiguredNames;
}

export function registerCodexMcpDelegationSettings(deps: CodexMcpDelegationSettingsDeps = {
  read: async () => (await getPolicyStore()).loadCodexMcpDelegation(),
  save: async (settings) => (await getPolicyStore()).saveCodexMcpDelegation(settings),
  names: listConfiguredNames,
}) {
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.codexMcpDelegation, async (_event, input: unknown): Promise<CodexMcpDelegationPreview> => {
    const request = CodexMcpDelegationPreviewArgsSchema.safeParse(input);
    if (!request.success) return { ok: false };
    try {
      const settings = await deps.read();
      const directory = currentMcpDelegationDirectory();
      const accountExists = directory?.profiles.some((profile) => profile.providerId === "codex" && profile.id === request.data.codexAccountProfileId);
      const names = accountExists ? await deps.names(request.data).catch(() => null) : null;
      const account = directory && names ? codexMcpDelegationCandidates(settings, names, directory) : null;
      return { ok: true, settings, servers: account?.servers ?? null };
    } catch {
      return { ok: false };
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.setCodexMcpDelegation, async (_event, input: unknown): Promise<boolean> => {
    const settings = CodexMcpDelegationSettingsSchema.safeParse(input);
    if (!settings.success) return false;
    try {
      const directory = currentMcpDelegationDirectory();
      if (!directory || (settings.data.enabled && !claudeSignInAccounts(directory).some((profile) => profile.id === settings.data.claudeAccountProfileId))) return false;
      await deps.save(settings.data);
      return true;
    } catch {
      return false;
    }
  });
}
