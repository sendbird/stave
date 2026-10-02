import { closeSync, openSync, readSync, fstatSync } from "node:fs";
import { homedir } from "node:os";
import { ipcMain } from "electron";
import {
  PROVIDER_ACCOUNT_IDENTITY_IPC,
  ProviderAccountIdentityArgsSchema,
} from "../../../src/lib/providers/provider-account-identity";
import {
  ProviderAccountIdentityCache,
  probeProviderAccountIdentity,
  providerAccountIdentityKey,
  type IdentityProbeDeps,
} from "../../provider-accounts/identity";
import { getProviderAccountRegistry } from "../../provider-accounts/registry";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
  prepareCliExecutableDiscovery,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../../providers/cli-path-env";
import { runExecutableProbe } from "../../providers/runtime-shared";

/** Reads at most `maxBytes` of a text file; a larger file is refused rather than truncated. */
async function readBoundedText(filePath: string, maxBytes: number) {
  const fd = openSync(filePath, "r");
  try {
    if (fstatSync(fd).size > maxBytes) throw new Error("File is too large.");
    const buffer = Buffer.alloc(maxBytes);
    const length = readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, length).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

export const nativeIdentityProbeDeps: IdentityProbeDeps = {
  prepare: prepareCliExecutableDiscovery,
  resolveExecutable: ({ providerId, binaryPath }) =>
    providerId === "claude-code"
      ? resolveClaudeCliExecutablePath({ explicitPath: binaryPath })
      : resolveCodexCliExecutablePath({ explicitPath: binaryPath }),
  // A status check needs no MCP environment, so skip reading MCP configuration.
  buildEnv: ({ providerId, profileId, executablePath }) =>
    providerId === "claude-code"
      ? buildClaudeCliEnv({ executablePath, accountProfileId: profileId, mcpConfigPaths: [] })
      : buildCodexCliEnv({ executablePath, accountProfileId: profileId, mcpConfigPaths: [] }),
  run: (args) => runExecutableProbe(args),
  readTextFile: readBoundedText,
  homeDirectory: homedir,
};

/**
 * `provider-accounts:identity`: who an account is signed in as. The reply is a
 * state, an email and a plan label. The probe and any credential-file read stay
 * in this process, and failures answer with a fixed message, never CLI output.
 */
export function registerProviderAccountIdentityHandlers(deps: IdentityProbeDeps = nativeIdentityProbeDeps) {
  const cache = new ProviderAccountIdentityCache((args) => probeProviderAccountIdentity(args, deps));
  ipcMain.handle(PROVIDER_ACCOUNT_IDENTITY_IPC.identity, async (_event, input: unknown) => {
    const parsed = ProviderAccountIdentityArgsSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, message: "Invalid sign-in status request." };
    try {
      const profiles = getProviderAccountRegistry().list();
      cache.retainOnly(new Set(profiles.map((profile) => providerAccountIdentityKey(profile.providerId, profile.id))));
      const profile = profiles.find(
        (candidate) => candidate.providerId === parsed.data.providerId && candidate.id === parsed.data.profileId,
      );
      if (!profile) return { ok: false as const, message: "The provider account no longer exists." };
      if (profile.gateway) return { ok: false as const, message: "An API connection has no sign-in." };
      return { ok: true as const, identity: await cache.get(parsed.data) };
    } catch {
      return { ok: false as const, message: "Sign-in status is unavailable." };
    }
  });
}
