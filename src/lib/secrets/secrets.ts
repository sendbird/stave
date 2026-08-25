/**
 * Shared types for the general secret store (API tokens and other secret
 * values). Unlike Lens saved accounts, secrets are not bound to a hostname.
 * They are stored encrypted at rest and only revealed on explicit user
 * request, or injected into a primary provider runtime after an explicit task
 * binding or `@secret:{ENV_VAR_NAME}` prompt reference.
 */

/** Metadata safe to send to the renderer. Never carries the secret value. */
export interface SecretMetadata {
  id: string;
  /** Human-friendly label, unique per store, e.g. "OpenAI API key". */
  name: string;
  /** Optional free-form note describing where the secret is used. */
  description: string;
  /** Non-secret preview of the value, e.g. the last 4 characters. */
  valuePreview: string;
  /**
   * Optional POSIX environment-variable name. When set, the secret can be bound
   * to a task so its provider runtime receives the value under this name. The
   * value itself is never carried here — only the variable name.
   */
  envVarName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretUpsertInput {
  id?: string;
  name: string;
  description?: string;
  /**
   * Optional POSIX environment-variable name to expose this secret under when
   * it is bound to a task. Pass an empty string to clear a previously set name.
   */
  envVarName?: string;
  /** Required when creating an entry. Omit while editing to keep the value. */
  value?: string;
}

export interface SecretRevealResult {
  id: string;
  value: string;
}

/** Longest value we accept, matching the IPC/vault schema bound. */
export const SECRET_VALUE_MAX_LENGTH = 8192;

/** Most secrets a single task may bind for env injection. */
export const MAX_BOUND_SECRETS = 32;

/**
 * Build a non-secret preview of a value. Shows only the last few characters so
 * the list can distinguish entries without exposing the full secret. Short
 * values are fully masked.
 */
export function buildSecretPreview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed.length <= 4) {
    return "•".repeat(trimmed.length);
  }
  return `••••${trimmed.slice(-4)}`;
}

/**
 * Normalize a secret name to a trimmed, non-empty label. Returns null when the
 * name is empty after trimming so a blank entry never saves.
 */
export function normalizeSecretName(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * POSIX-ish environment variable name: a letter or underscore, followed by
 * letters, digits, or underscores. Enforced everywhere an `envVarName` is
 * accepted so a bound secret can never produce an invalid shell variable.
 */
export const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Longest environment variable name we accept. */
export const ENV_VAR_NAME_MAX_LENGTH = 128;

/**
 * Environment variable names a bound secret must never claim. Injecting any of
 * these could hijack CLI discovery, the vault's own encryption path, or the
 * Stave-managed MCP token. Enforced at resolve time in the main process and
 * surfaced to the user at edit time.
 */
export const RESERVED_ENV_VAR_NAMES: readonly string[] = [
  "PATH",
  "HOME",
  "CLAUDE_CONFIG_DIR",
  "CLAUDECODE",
  "CODEX_HOME",
  "NVM_DIR",
  "NVM_BIN",
  "NVM_INC",
  "STAVE_LOCAL_MCP_TOKEN",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ELECTRON_NO_ASAR",
  "ELECTRON_ENABLE_LOGGING",
  "ELECTRON_ENABLE_STACK_DUMPING",
  "ELECTRON_DISABLE_SECURITY_WARNINGS",
];

const RESERVED_ENV_VAR_NAME_SET = new Set(RESERVED_ENV_VAR_NAMES);

/** True when the name collides with a reserved variable (case-sensitive). */
export function isReservedEnvVarName(value: string): boolean {
  return RESERVED_ENV_VAR_NAME_SET.has(value.trim());
}

/**
 * Normalize an optional environment-variable name. Returns:
 * - `undefined` when the input is blank (secret is simply not injectable),
 * - the trimmed name when it is a valid, non-reserved POSIX identifier.
 * Throws a user-facing error for an invalid or reserved name so callers can
 * surface a precise message instead of silently dropping the value.
 */
export function normalizeEnvVarName(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > ENV_VAR_NAME_MAX_LENGTH) {
    throw new Error(
      `The environment variable name must be at most ${ENV_VAR_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (!ENV_VAR_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      "The environment variable name must start with a letter or underscore and contain only letters, digits, and underscores.",
    );
  }
  if (isReservedEnvVarName(trimmed)) {
    throw new Error(
      `"${trimmed}" is reserved and cannot be used as a secret environment variable name.`,
    );
  }
  return trimmed;
}
