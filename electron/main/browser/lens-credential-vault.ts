import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  normalizeLensCredentialHost,
  normalizeLensCredentialHosts,
  type LensCredentialMetadata,
  type LensCredentialUpsertInput,
} from "../../../src/lib/lens/lens-credentials";

const VAULT_VERSION = 2;

const StoredSecretSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .strict();

const StoredCredentialSchema = z
  .object({
    id: z.string().uuid(),
    hosts: z.array(z.string().min(1)).min(1),
    secretCiphertext: z.string().min(1),
    autoFill: z.boolean(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

const VaultDocumentSchema = z
  .object({
    version: z.literal(VAULT_VERSION),
    credentials: z.array(StoredCredentialSchema),
  })
  .strict();

/** Vault format written before accounts could target multiple hostnames. */
const LegacyVaultDocumentV1Schema = z
  .object({
    version: z.literal(1),
    credentials: z.array(
      StoredCredentialSchema.omit({ hosts: true }).extend({
        host: z.string().min(1),
      }),
    ),
  })
  .strict();

type StoredCredential = z.infer<typeof StoredCredentialSchema>;

export interface LensCredentialVaultCrypto {
  isEncryptionAvailable(): boolean;
  isInsecureBackend(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface LensCredentialSecret extends LensCredentialMetadata {
  password: string;
  /** The exact hostname that matched the requested URL. */
  matchedHost: string;
}

function toMetadata(
  entry: StoredCredential,
  username: string,
): LensCredentialMetadata {
  return {
    id: entry.id,
    hosts: [...entry.hosts],
    username,
    autoFill: entry.autoFill,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export class LensCredentialVault {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly args: {
      filePath: string;
      crypto: LensCredentialVaultCrypto;
      now?: () => string;
      createId?: () => string;
    },
  ) {}

  async list(): Promise<LensCredentialMetadata[]> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    return document.credentials
      .map((entry) => toMetadata(entry, this.decryptSecret(entry).username))
      .sort(
        (left, right) =>
          // A credential is normalized to at least one host on write, but the
          // vault file is on disk and a hand-edited or truncated entry must not
          // crash the account list — it sorts first instead.
          (left.hosts[0] ?? "").localeCompare(right.hosts[0] ?? "") ||
          left.username.localeCompare(right.username),
      );
  }

  async upsert(
    input: LensCredentialUpsertInput,
  ): Promise<LensCredentialMetadata> {
    return this.enqueueMutation(async () => {
      this.assertSecureEncryption();
      const hosts = normalizeLensCredentialHosts(input.hosts);
      const username = input.username.trim();
      if (!hosts) {
        throw new Error(
          "Enter at least one valid http(s) hostname for the Lens account.",
        );
      }
      if (!username) {
        throw new Error("Username is required.");
      }

      const document = await this.readDocument();
      const existingIndex = input.id
        ? document.credentials.findIndex((entry) => entry.id === input.id)
        : -1;
      if (input.id && existingIndex < 0) {
        throw new Error("The saved Lens account no longer exists.");
      }
      const existing =
        existingIndex >= 0 ? document.credentials[existingIndex] : undefined;
      if (!existing && !input.password) {
        throw new Error("Password is required for a new Lens account.");
      }

      const timestamp = (this.args.now ?? (() => new Date().toISOString()))();
      const existingSecret = existing ? this.decryptSecret(existing) : null;
      const secretCiphertext = this.args.crypto
        .encryptString(
          JSON.stringify({
            username,
            password: input.password ?? existingSecret!.password,
          }),
        )
        .toString("base64");
      const next: StoredCredential = {
        id: existing?.id ?? (this.args.createId ?? randomUUID)(),
        hosts,
        secretCiphertext,
        autoFill: input.autoFill,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      if (existingIndex >= 0) {
        document.credentials[existingIndex] = next;
      } else {
        document.credentials.push(next);
      }
      if (next.autoFill) {
        document.credentials = document.credentials.map((entry) =>
          entry.id !== next.id &&
          entry.hosts.some((entryHost) => hosts.includes(entryHost))
            ? { ...entry, autoFill: false }
            : entry,
        );
      }
      await this.writeDocument(document);
      return toMetadata(next, username);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const document = await this.readDocument();
      const nextCredentials = document.credentials.filter(
        (entry) => entry.id !== id,
      );
      if (nextCredentials.length === document.credentials.length) {
        return false;
      }
      await this.writeDocument({
        version: VAULT_VERSION,
        credentials: nextCredentials,
      });
      return true;
    });
  }

  async findForUrl(
    url: string,
    options?: { autoFillOnly?: boolean; username?: string },
  ): Promise<LensCredentialSecret | null> {
    this.assertSecureEncryption();
    const host = normalizeLensCredentialHost(url);
    if (!host) {
      return null;
    }
    const document = await this.readDocument();
    const matchingEntries = document.credentials.filter((candidate) =>
      candidate.hosts.includes(host),
    );
    let entry: StoredCredential | undefined;
    if (options?.username) {
      entry = matchingEntries.find(
        (candidate) =>
          this.decryptSecret(candidate).username === options.username,
      );
    } else if (options?.autoFillOnly) {
      entry = matchingEntries.find((candidate) => candidate.autoFill);
    } else {
      entry =
        matchingEntries.find((candidate) => candidate.autoFill) ??
        (matchingEntries.length === 1 ? matchingEntries[0] : undefined);
    }
    if (!entry) {
      return null;
    }
    const secret = this.decryptSecret(entry);
    return {
      ...toMetadata(entry, secret.username),
      password: secret.password,
      matchedHost: host,
    };
  }

  private decryptSecret(
    entry: StoredCredential,
  ): z.infer<typeof StoredSecretSchema> {
    const plaintext = this.args.crypto.decryptString(
      Buffer.from(entry.secretCiphertext, "base64"),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new Error(
        `The saved Lens account for ${entry.hosts.join(", ")} cannot be decrypted.`,
      );
    }
    const result = StoredSecretSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `The saved Lens account for ${entry.hosts.join(", ")} has invalid secret data.`,
      );
    }
    return result.data;
  }

  private assertSecureEncryption(): void {
    if (!this.args.crypto.isEncryptionAvailable()) {
      throw new Error(
        "OS credential encryption is unavailable. Unlock the system credential store and retry.",
      );
    }
    if (this.args.crypto.isInsecureBackend()) {
      throw new Error(
        "Lens account storage requires an OS credential store; Electron basic_text encryption is not accepted.",
      );
    }
  }

  private async readDocument(): Promise<z.infer<typeof VaultDocumentSchema>> {
    let raw: string;
    try {
      raw = await fs.readFile(this.args.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: VAULT_VERSION, credentials: [] };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The Lens account vault is not valid JSON.");
    }
    const result = VaultDocumentSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    const legacyResult = LegacyVaultDocumentV1Schema.safeParse(parsed);
    if (legacyResult.success) {
      // Upgrade in memory; the next mutation persists the v2 format.
      return {
        version: VAULT_VERSION,
        credentials: legacyResult.data.credentials.map(
          ({ host, ...entry }) => ({ ...entry, hosts: [host] }),
        ),
      };
    }
    throw new Error("The Lens account vault has an unsupported format.");
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
