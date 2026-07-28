import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildSecretPreview,
  normalizeSecretName,
  type SecretMetadata,
  type SecretRevealResult,
  type SecretUpsertInput,
} from "../../../src/lib/secrets/secrets";

const VAULT_VERSION = 1;

const StoredSecretSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string(),
    valuePreview: z.string(),
    valueCiphertext: z.string().min(1),
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

export interface SecretVaultCrypto {
  isEncryptionAvailable(): boolean;
  isInsecureBackend(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

function toMetadata(entry: StoredSecret): SecretMetadata {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    valuePreview: entry.valuePreview,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export class SecretVault {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly args: {
      filePath: string;
      crypto: SecretVaultCrypto;
      now?: () => string;
      createId?: () => string;
    },
  ) {}

  async list(): Promise<SecretMetadata[]> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    return document.secrets
      .map(toMetadata)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.createdAt.localeCompare(right.createdAt),
      );
  }

  async upsert(input: SecretUpsertInput): Promise<SecretMetadata> {
    return this.enqueueMutation(async () => {
      this.assertSecureEncryption();
      const name = normalizeSecretName(input.name);
      if (!name) {
        throw new Error("A name is required for the secret.");
      }
      const description = (input.description ?? "").trim();

      const document = await this.readDocument();
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

      const timestamp = (this.args.now ?? (() => new Date().toISOString()))();
      let valueCiphertext = existing?.valueCiphertext;
      let valuePreview = existing?.valuePreview ?? "";
      if (value !== undefined) {
        valueCiphertext = this.args.crypto
          .encryptString(value)
          .toString("base64");
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
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      if (existingIndex >= 0) {
        document.secrets[existingIndex] = next;
      } else {
        document.secrets.push(next);
      }
      await this.writeDocument(document);
      return toMetadata(next);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const document = await this.readDocument();
      const nextSecrets = document.secrets.filter((entry) => entry.id !== id);
      if (nextSecrets.length === document.secrets.length) {
        return false;
      }
      await this.writeDocument({
        version: VAULT_VERSION,
        secrets: nextSecrets,
      });
      return true;
    });
  }

  async reveal(id: string): Promise<SecretRevealResult | null> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    const entry = document.secrets.find((candidate) => candidate.id === id);
    if (!entry) {
      return null;
    }
    return { id: entry.id, value: this.decryptValue(entry) };
  }

  private decryptValue(entry: StoredSecret): string {
    try {
      return this.args.crypto.decryptString(
        Buffer.from(entry.valueCiphertext, "base64"),
      );
    } catch {
      throw new Error(`The secret "${entry.name}" cannot be decrypted.`);
    }
  }

  private assertSecureEncryption(): void {
    if (!this.args.crypto.isEncryptionAvailable()) {
      throw new Error(
        "OS credential encryption is unavailable. Unlock the system credential store and retry.",
      );
    }
    if (this.args.crypto.isInsecureBackend()) {
      throw new Error(
        "Secret storage requires an OS credential store; Electron basic_text encryption is not accepted.",
      );
    }
  }

  private async readDocument(): Promise<z.infer<typeof VaultDocumentSchema>> {
    let raw: string;
    try {
      raw = await fs.readFile(this.args.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: VAULT_VERSION, secrets: [] };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The secret vault is not valid JSON.");
    }
    const result = VaultDocumentSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    throw new Error("The secret vault has an unsupported format.");
  }

  private async writeDocument(
    document: z.infer<typeof VaultDocumentSchema>,
  ): Promise<void> {
    const directory = path.dirname(this.args.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tempPath = `${this.args.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.rename(tempPath, this.args.filePath);
      await fs.chmod(this.args.filePath, 0o600);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
