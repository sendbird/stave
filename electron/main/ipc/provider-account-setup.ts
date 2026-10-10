import { ipcMain } from "electron";
import {
  PROVIDER_ACCOUNT_SETUP_IPC,
  ProviderAccountSetupStatusArgsSchema,
  ProviderAccountShareSetupArgsSchema,
  type ProviderAccountSetupResult,
} from "../../../src/lib/providers/provider-account-setup";
import { getProviderAccountRegistry, systemDirectory } from "../../provider-accounts/registry";
import {
  applySetupSharing,
  readSetupSharing,
  removeSetupSharing,
  type SetupSharingTarget,
} from "../../provider-accounts/setup-sharing";

const fail = (message: string): ProviderAccountSetupResult => ({ ok: false, message });

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
 * copied settings) or off. Replies carry entry names, labels and states only.
 */
export function registerProviderAccountSetupHandlers(resolveSystemDirectory: (providerId: SetupSharingTarget["providerId"]) => string = systemDirectory) {
  ipcMain.handle(PROVIDER_ACCOUNT_SETUP_IPC.setupStatus, (_event, input: unknown): ProviderAccountSetupResult => {
    const parsed = ProviderAccountSetupStatusArgsSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid provider account details.");
    try {
      const target = resolveTarget(parsed.data, resolveSystemDirectory);
      return typeof target === "string" ? fail(target) : { ok: true, setup: readSetupSharing(target) };
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
      return { ok: true, setup };
    } catch (error) {
      // The messages thrown by the sharing code are fixed text with no paths.
      return fail(error instanceof Error && /^(This account|The account folder)/.test(error.message) ? error.message : "Could not update the shared setup.");
    }
  });
}
