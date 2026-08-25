import path from "node:path";
import type { SecretUpsertInput } from "../../../src/lib/secrets/secrets";
import { SecretVault } from "./secret-vault";

const VAULT_FILENAME = "secrets.v1.json";

let vault: SecretVault | null = null;

// `electron` is loaded lazily inside the getter (not at module top-level) so
// that importing the main-process-only secret resolver into provider runtimes
// does not eagerly pull `electron` into their import graph. That keeps the
// runtimes importable under the bun test runner, which cannot resolve the
// `electron` module's `app`/`safeStorage` exports.
function getVault(): SecretVault {
  if (vault) {
    return vault;
  }
  const { app, safeStorage } =
    require("electron") as typeof import("electron");
  vault = new SecretVault({
    filePath: path.join(app.getPath("userData"), VAULT_FILENAME),
    crypto: {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      isInsecureBackend: () =>
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text",
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value),
    },
  });
  return vault;
}

export async function listSecrets() {
  return getVault().list();
}

export async function upsertSecret(input: SecretUpsertInput) {
  return getVault().upsert(input);
}

export async function deleteSecret(id: string) {
  return getVault().delete(id);
}

export async function revealSecret(id: string) {
  return getVault().reveal(id);
}

/**
 * Resolve a task's bound secret ids and explicit prompt reference keys to an
 * environment map for provider shell commands and supported MCP
 * authentication. MAIN-PROCESS ONLY: this returns plaintext values, so it must
 * never reach preload, the renderer, model-visible text, or logs.
 *
 * Returns an empty map on any resolution failure rather than throwing, so a
 * misconfigured or unavailable vault degrades to "no injected secrets" instead
 * of blocking the turn. Only counts, env-var names, and skip reasons are
 * logged — never values.
 */
export async function resolveBoundSecretEnv(args: {
  ids: readonly string[];
  referenceKeys?: readonly string[];
}): Promise<Record<string, string>> {
  const ids = args.ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const referenceKeys = (args.referenceKeys ?? []).filter(
    (key): key is string => typeof key === "string" && key.trim().length > 0,
  );
  if (ids.length === 0 && referenceKeys.length === 0) {
    return {};
  }
  try {
    const secretVault = getVault();
    const [boundResult, referenceResult] = await Promise.all([
      ids.length > 0
        ? secretVault.resolveEnvForIds(ids)
        : Promise.resolve({ env: {}, skipped: [] }),
      referenceKeys.length > 0
        ? secretVault.resolveEnvForReferences(referenceKeys)
        : Promise.resolve({ env: {}, skipped: [] }),
    ]);
    const env = { ...boundResult.env, ...referenceResult.env };
    const skippedLabels = [
      ...boundResult.skipped.map((entry) =>
        entry.envVarName
          ? `${entry.envVarName}:${entry.reason}`
          : entry.reason,
      ),
      ...referenceResult.skipped.map((entry) =>
        entry.key ? `${entry.key}:${entry.reason}` : entry.reason,
      ),
    ];
    const injectedNames = Object.keys(env);
    if (skippedLabels.length > 0 || injectedNames.length > 0) {
      console.info(
        `[secrets] resolved ${injectedNames.length}/${ids.length + referenceKeys.length} secret binding/reference(s) for injection` +
          (injectedNames.length > 0
            ? ` (${injectedNames.join(", ")})`
            : "") +
          (skippedLabels.length > 0
            ? `; skipped ${skippedLabels.join(", ")}`
            : ""),
      );
    }
    return env;
  } catch (error) {
    console.warn(
      `[secrets] failed to resolve bound secrets for injection: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {};
  }
}
