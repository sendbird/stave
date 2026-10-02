import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import { resolveLoginShellEnvVarValue } from "../providers/executable-path";
import {
  MAX_PROVIDER_ACCOUNT_PROFILES,
  ProviderAccountCreateArgsSchema,
  ProviderAccountRenameArgsSchema,
  ProviderAccountRemoveArgsSchema,
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountCreateArgs,
  type ProviderAccountProfile,
  type ProviderAccountProviderId,
  type ProviderAccountRenameArgs,
  type ProviderAccountRemoveArgs,
} from "../../src/lib/providers/provider-accounts";

const SavedProfileSchema = ProviderAccountCreateArgsSchema.extend({
  id: z.uuid(),
  kind: z.enum(["managed", "external"]),
  configDirectory: z.string().min(1).max(4096),
}).strict();
const RegistrySchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(SavedProfileSchema).max(MAX_PROVIDER_ACCOUNT_PROFILES),
  })
  .strict();
type SavedProfile = z.infer<typeof SavedProfileSchema>;

export function systemDirectory(providerId: ProviderAccountProviderId) {
  const key = providerId === "claude-code" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  return (
    resolveLoginShellEnvVarValue({ key }) ||
    process.env[key]?.trim() ||
    path.join(homedir(), providerId === "claude-code" ? ".claude" : ".codex")
  );
}

function canonicalOrResolved(directory: string) {
  try {
    return realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}

function readDirectory(directory: string) {
  if (!path.isAbsolute(directory))
    throw new Error("Choose an absolute configuration directory.");
  try {
    const canonical = realpathSync(directory);
    if (statSync(canonical).isDirectory()) return canonical;
  } catch {
    /* Keep filesystem details out of the public error. */
  }
  throw new Error(
    "The configuration directory does not exist or is not a directory.",
  );
}

/** Only Electron main mutates this registry. The host reads each atomic snapshot. */
export class ProviderAccountRegistry {
  readonly filePath: string;
  private readonly managedRoot: string;

  constructor(
    userDataPath: string,
    private readonly resolveSystemDirectory = systemDirectory,
  ) {
    if (!path.isAbsolute(userDataPath))
      throw new Error(
        "Provider account storage requires an absolute app data path.",
      );
    this.filePath = path.join(userDataPath, "provider-accounts.json");
    this.managedRoot = path.join(userDataPath, "provider-accounts");
  }

  list(): ProviderAccountProfile[] {
    return [
      ...(["claude-code", "codex"] as const).map((providerId) => ({
        id: SYSTEM_ACCOUNT_PROFILE_ID,
        providerId,
        label: "System default",
        kind: "system" as const,
      })),
      ...this.read(),
    ];
  }

  create(input: ProviderAccountCreateArgs): ProviderAccountProfile {
    const parsed = ProviderAccountCreateArgsSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid provider account details.");
    const args = parsed.data;
    if (args.gateway && (args.providerId !== "claude-code" || args.configDirectory))
      throw new Error("Gateway connections require a separate managed Claude profile.");
    const profiles = this.read();
    if (profiles.length >= MAX_PROVIDER_ACCOUNT_PROFILES)
      throw new Error("The provider account limit has been reached.");
    const id = randomUUID();
    let createdDirectory: string | undefined;
    try {
      let configDirectory: string;
      if (args.configDirectory) {
        configDirectory = readDirectory(args.configDirectory);
        if (
          configDirectory ===
          canonicalOrResolved(this.resolveSystemDirectory(args.providerId))
        ) {
          throw new Error(
            "This directory belongs to System default. Use System default instead.",
          );
        }
      } else {
        mkdirSync(this.managedRoot, { recursive: true, mode: 0o700 });
        createdDirectory = path.join(this.managedRoot, id);
        mkdirSync(createdDirectory, { mode: 0o700 });
        configDirectory = readDirectory(createdDirectory);
      }
      if (
        profiles.some((profile) => profile.configDirectory === configDirectory)
      ) {
        throw new Error("This configuration directory is already registered.");
      }
      const profile: SavedProfile = {
        id,
        providerId: args.providerId,
        label: args.label,
        kind: args.configDirectory ? "external" : "managed",
        configDirectory,
        ...(args.gateway ? { gateway: args.gateway } : {}),
      };
      this.write([...profiles, profile]);
      return profile;
    } catch (error) {
      if (createdDirectory) {
        try {
          rmdirSync(createdDirectory);
        } catch {
          /* Remove only a newly created, empty directory. */
        }
      }
      throw error;
    }
  }

  rename(input: ProviderAccountRenameArgs): ProviderAccountProfile {
    const parsed = ProviderAccountRenameArgsSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid provider account details.");
    const profiles = this.read();
    const index = this.findIndex(profiles, parsed.data);
    const profile = { ...profiles[index]!, label: parsed.data.label };
    profiles[index] = profile;
    this.write(profiles);
    return profile;
  }

  remove(input: ProviderAccountRemoveArgs) {
    const parsed = ProviderAccountRemoveArgsSchema.safeParse(input);
    if (!parsed.success) throw new Error("Invalid provider account id.");
    const profiles = this.read();
    profiles.splice(this.findIndex(profiles, parsed.data), 1);
    // Native credentials and session files belong to the user, even in managed directories.
    this.write(profiles);
  }

  resolveDirectory(args: {
    providerId: ProviderAccountProviderId;
    profileId?: string;
  }): string | null {
    if (
      args.profileId === undefined ||
      args.profileId === SYSTEM_ACCOUNT_PROFILE_ID
    )
      return null;
    const profiles = this.read();
    const profile =
      profiles[
        this.findIndex(profiles, {
          providerId: args.providerId,
          id: args.profileId,
        })
      ]!;
    const canonical = readDirectory(profile.configDirectory);
    if (canonical !== profile.configDirectory)
      throw new Error(
        "The account configuration directory changed. Register it again.",
      );
    return canonical;
  }

  resolveGateway(profileId: string) {
    if (profileId === SYSTEM_ACCOUNT_PROFILE_ID) return undefined;
    const profile = this.read().find(p => p.id === profileId && p.providerId === "claude-code");
    if (!profile) throw new Error("The provider account no longer exists.");
    if (profile.gateway) this.resolveDirectory({ providerId: "claude-code", profileId });
    return profile.gateway;
  }

  private findIndex(
    profiles: SavedProfile[],
    args: { providerId: ProviderAccountProviderId; id: string },
  ) {
    const index = profiles.findIndex(
      (profile) =>
        profile.id === args.id && profile.providerId === args.providerId,
    );
    if (index < 0) throw new Error("The provider account no longer exists.");
    return index;
  }

  private read(): SavedProfile[] {
    let content: string;
    try {
      content = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("Provider account storage could not be read.");
    }
    try {
      const { profiles } = RegistrySchema.parse(JSON.parse(content));
      const ids = new Set(profiles.map((profile) => profile.id));
      const directories = new Set(
        profiles.map((profile) => profile.configDirectory),
      );
      if (
        ids.size !== profiles.length ||
        directories.size !== profiles.length ||
        profiles.some((profile) => !path.isAbsolute(profile.configDirectory) ||
          (profile.gateway && (profile.providerId !== "claude-code" || profile.kind !== "managed")))
      )
        throw new Error();
      return profiles;
    } catch {
      throw new Error(
        "Provider account storage is invalid. Restore it before changing accounts.",
      );
    }
  }

  private write(profiles: SavedProfile[]) {
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    let fd: number | undefined;
    try {
      fd = openSync(temporaryPath, "wx", 0o600);
      writeFileSync(fd, JSON.stringify({ version: 1, profiles }), "utf8");
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporaryPath, this.filePath);
    } finally {
      if (fd !== undefined) closeSync(fd);
      try {
        unlinkSync(temporaryPath);
      } catch {
        /* A successful rename consumed the temporary file. */
      }
    }
  }
}

export function getProviderAccountRegistry() {
  const userDataPath = process.env.STAVE_USER_DATA_PATH?.trim();
  if (!userDataPath)
    throw new Error("Provider account storage is not configured.");
  return new ProviderAccountRegistry(path.resolve(userDataPath));
}
