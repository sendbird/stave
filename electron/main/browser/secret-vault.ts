import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  buildSecretPreview,
  ENV_VAR_NAME_MAX_LENGTH,
  ENV_VAR_NAME_PATTERN,
  isReservedEnvVarName,
  normalizeEnvVarName,
  normalizeSecretName,
  type SecretMetadata,
  type SecretRevealResult,
  type SecretUpsertInput,
} from "../../../src/lib/secrets/secrets";
import { OsKeychainVaultFile, type OsKeychainCrypto } from "./os-keychain-vault";

const VAULT_VERSION = 1;

const StoredSecretSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string(),
    valuePreview: z.string(),
    valueCiphertext: z.string().min(1),
    // Optional POSIX env-var name. Absent in vault files written before this
    // field existed; `.strict()` rejects only unknown keys, not missing
    // optional ones, so no VAULT_VERSION bump is required for back-compat.
    envVarName: z
      .string()
      .max(ENV_VAR_NAME_MAX_LENGTH)
      .regex(ENV_VAR_NAME_PATTERN)
      .optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

const VaultDocumentSchema = z
  .object({
    version: z.literal(VAULT_VERSION),
    secrets: z.array(StoredSecretSchema),
  })
  .strict();

type StoredSecret = z.infer<typeof StoredSecretSchema>;
type VaultDocument = z.infer<typeof VaultDocumentSchema>;

export type SecretVaultCrypto = OsKeychainCrypto;

function toMetadata(entry: StoredSecret): SecretMetadata {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    valuePreview: entry.valuePreview,
    ...(entry.envVarName ? { envVarName: entry.envVarName } : {}),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export class SecretVault {
  private readonly file: OsKeychainVaultFile<VaultDocument>;

  constructor(
    private readonly args: {
      filePath: string;
      crypto: SecretVaultCrypto;
      now?: () => string;
      createId?: () => string;
    },
  ) {
    this.file = new OsKeychainVaultFile({
      filePath: args.filePath,
      crypto: args.crypto,
      storageLabel: "Secret storage",
      documentLabel: "secret vault",
      emptyDocument: () => ({ version: VAULT_VERSION, secrets: [] }),
      parseDocument: (parsed) => {
        const result = VaultDocumentSchema.safeParse(parsed);
        return result.success ? result.data : null;
      },
    });
  }

  async list(): Promise<SecretMetadata[]> {
    this.file.assertSecureEncryption();
    const document = await this.file.readDocument();
    return document.secrets
      .map(toMetadata)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.createdAt.localeCompare(right.createdAt),
      );
  }

  async upsert(input: SecretUpsertInput): Promise<SecretMetadata> {
    return this.file.enqueueMutation(async () => {
      this.file.assertSecureEncryption();
      const name = normalizeSecretName(input.name);
      if (!name) {
        throw new Error("A name is required for the secret.");
      }
      const description = (input.description ?? "").trim();
      // Throws a user-facing error for an invalid/reserved name; `undefined`
      // means the secret keeps no env-var name and is not injectable.
      const envVarName = normalizeEnvVarName(input.envVarName);

      const document = await this.file.readDocument();
      const existingIndex = input.id
        ? document.secrets.findIndex((entry) => entry.id === input.id)
        : -1;
      if (input.id && existingIndex < 0) {
        throw new Error("The saved secret no longer exists.");
      }
      const existing =
        existingIndex >= 0 ? document.secrets[existingIndex] : undefined;

      const value = input.value;
      if (!existing && !value) {
        throw new Error("A value is required for a new secret.");
      }
      if (value !== undefined && value.length === 0) {
        throw new Error("The secret value cannot be empty.");
      }

      const duplicateName = document.secrets.some(
        (entry) =>
          entry.id !== existing?.id &&
          entry.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicateName) {
        throw new Error(`A secret named "${name}" already exists.`);
      }

      // Env-var names must be globally unique so a bound set never collides on
      // a single variable (case-sensitive, matching shell semantics).
      if (envVarName) {
        if (isReservedEnvVarName(envVarName)) {
          throw new Error(
            `"${envVarName}" is reserved and cannot be used as a secret environment variable name.`,
          );
        }
        const duplicateEnvVarName = document.secrets.some(
          (entry) =>
            entry.id !== existing?.id && entry.envVarName === envVarName,
        );
        if (duplicateEnvVarName) {
          throw new Error(
            `Another secret already uses the environment variable "${envVarName}".`,
          );
        }
      }

      const timestamp = (this.args.now ?? (() => new Date().toISOString()))();
      let valueCiphertext = existing?.valueCiphertext;
      let valuePreview = existing?.valuePreview ?? "";
      if (value !== undefined) {
        valueCiphertext = this.file.encryptToBase64(value);
        valuePreview = buildSecretPreview(value);
      }
      if (!valueCiphertext) {
        throw new Error("A value is required for a new secret.");
      }

      const next: StoredSecret = {
        id: existing?.id ?? (this.args.createId ?? randomUUID)(),
        name,
        description,
        valuePreview,
        valueCiphertext,
        ...(envVarName ? { envVarName } : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      if (existingIndex >= 0) {
        document.secrets[existingIndex] = next;
      } else {
        document.secrets.push(next);
      }
      await this.file.writeDocument(document);
      return toMetadata(next);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.file.enqueueMutation(async () => {
      const document = await this.file.readDocument();
      const nextSecrets = document.secrets.filter((entry) => entry.id !== id);
      if (nextSecrets.length === document.secrets.length) {
        return false;
      }
      await this.file.writeDocument({
        version: VAULT_VERSION,
        secrets: nextSecrets,
      });
      return true;
    });
  }

  async reveal(id: string): Promise<SecretRevealResult | null> {
    this.file.assertSecureEncryption();
    const document = await this.file.readDocument();
    const entry = document.secrets.find((candidate) => candidate.id === id);
    if (!entry) {
      return null;
    }
    return { id: entry.id, value: this.decryptValue(entry) };
  }

  /**
   * Resolve bound secret ids to an environment map for provider runtime
   * injection. Main-process only — the plaintext values returned here must
   * never reach the renderer or model-visible text.
   *
   * A bound id is silently skipped (with the reason recorded in the returned
   * `skipped` list) when it has no id match, defines no `envVarName`, collides
   * with a reserved variable, or duplicates an already-resolved variable. The
   * reason strings and env-var names are safe to log; values are never logged.
   */
  async resolveEnvForIds(ids: readonly string[]): Promise<{
    env: Record<string, string>;
    skipped: Array<{ id: string; reason: string; envVarName?: string }>;
  }> {
    const env: Record<string, string> = {};
    const skipped: Array<{ id: string; reason: string; envVarName?: string }> =
      [];
    if (ids.length === 0) {
      return { env, skipped };
    }
    this.file.assertSecureEncryption();
    const document = await this.file.readDocument();
    const byId = new Map(document.secrets.map((entry) => [entry.id, entry]));
    const seenNames = new Set<string>();
    // De-duplicate ids while preserving first-seen order.
    const uniqueIds = [...new Set(ids)];
    for (const id of uniqueIds) {
      const entry = byId.get(id);
      if (!entry) {
        skipped.push({ id, reason: "not-found" });
        continue;
      }
      const envVarName = entry.envVarName;
      if (!envVarName) {
        skipped.push({ id, reason: "no-env-var-name" });
        continue;
      }
      if (isReservedEnvVarName(envVarName)) {
        skipped.push({ id, reason: "reserved-name", envVarName });
        continue;
      }
      if (seenNames.has(envVarName)) {
        skipped.push({ id, reason: "duplicate-name", envVarName });
        continue;
      }
      seenNames.add(envVarName);
      env[envVarName] = this.decryptValue(entry);
    }
    return { env, skipped };
  }

  private decryptValue(entry: StoredSecret): string {
    try {
      return this.file.decryptFromBase64(entry.valueCiphertext);
    } catch {
      throw new Error(`The secret "${entry.name}" cannot be decrypted.`);
    }
  }
}
