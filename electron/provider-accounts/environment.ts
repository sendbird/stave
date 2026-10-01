import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProviderId,
} from "../../src/lib/providers/provider-accounts";
import { getProviderAccountRegistry } from "./registry";
import { currentProviderAccountId } from "./runtime-scope";

const INHERITED_AUTH_KEYS = {
  "claude-code": [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
    "ANTHROPIC_API_KEY_FILE_DESCRIPTOR",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "ANTHROPIC_CUSTOM_HEADERS",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY",
  ],
  codex: ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"],
} as const;

function canonicalOrResolved(directory: string) {
  try {
    return realpathSync(directory);
  } catch {
    return path.resolve(directory);
  }
}

/** Resolve before reading MCP config; reapply after env hydration to protect profile identity. */
export function resolveProviderAccountEnvironment(args: {
  providerId: ProviderAccountProviderId;
  profileId?: string;
  env: Record<string, string | undefined>;
  resolveDirectory?: (args: {
    providerId: ProviderAccountProviderId;
    profileId: string;
  }) => string | null;
}) {
  args = { ...args, profileId: args.profileId ?? currentProviderAccountId(args.providerId) };
  if (
    args.profileId === undefined ||
    args.profileId === SYSTEM_ACCOUNT_PROFILE_ID
  )
    return (env: Record<string, string | undefined>) => env;
  const directory = (
    args.resolveDirectory ??
    ((selection) => getProviderAccountRegistry().resolveDirectory(selection))
  )({
    providerId: args.providerId,
    profileId: args.profileId,
  });
  if (!directory)
    throw new Error("The provider account could not be resolved.");
  const key =
    args.providerId === "claude-code" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  const systemDirectory =
    args.env[key] ||
    path.join(
      homedir(),
      args.providerId === "claude-code" ? ".claude" : ".codex",
    );
  if (canonicalOrResolved(systemDirectory) === directory)
    throw new Error(
      "This directory belongs to System default. Use System default instead.",
    );
  return (env: Record<string, string | undefined>) => {
    // A native profile must not inherit a different account's API or OAuth credentials.
    for (const authKey of INHERITED_AUTH_KEYS[args.providerId])
      delete env[authKey];
    env[key] = directory;
    if (args.providerId === "claude-code") env.CLAUDE_SECURESTORAGE_CONFIG_DIR = directory;
    return env;
  };
}
