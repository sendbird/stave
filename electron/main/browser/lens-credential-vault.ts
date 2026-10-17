import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  normalizeLensCredentialHost,
  normalizeLensCredentialHosts,
  type LensCredentialMetadata,
  type LensCredentialUpsertInput,
} from "../../../src/lib/lens/lens-credentials";
import { OsKeychainVaultFile, type OsKeychainCrypto } from "./os-keychain-vault";

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
type VaultDocument = z.infer<typeof VaultDocumentSchema>;

export type LensCredentialVaultCrypto = OsKeychainCrypto;

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

function parseVaultDocument(parsed: unknown): VaultDocument | null {
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
  return null;
}

export class LensCredentialVault {
  private readonly file: OsKeychainVaultFile<VaultDocument>;

  constructor(
    private readonly args: {
      filePath: string;
      crypto: LensCredentialVaultCrypto;
      now?: () => string;
      createId?: () => string;
    },
  ) {
    this.file = new OsKeychainVaultFile({
      filePath: args.filePath,
      crypto: args.crypto,
      storageLabel: "Lens account storage",
      documentLabel: "Lens account vault",
      emptyDocument: () => ({ version: VAULT_VERSION, credentials: [] }),
      parseDocument: parseVaultDocument,
    });
  }

  async list(): Promise<LensCredentialMetadata[]> {
    this.file.assertSecureEncryption();
    const document = await this.file.readDocument();
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
    return this.file.enqueueMutation(async () => {
      this.file.assertSecureEncryption();
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

      const document = await this.file.readDocument();
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
      const secretCiphertext = this.file.encryptToBase64(
        JSON.stringify({
          username,
          password: input.password ?? existingSecret!.password,
        }),
      );
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
      await this.file.writeDocument(document);
      return toMetadata(next, username);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.file.enqueueMutation(async () => {
      const document = await this.file.readDocument();
      const nextCredentials = document.credentials.filter(
        (entry) => entry.id !== id,
      );
      if (nextCredentials.length === document.credentials.length) {
        return false;
      }
      await this.file.writeDocument({
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
    this.file.assertSecureEncryption();
    const host = normalizeLensCredentialHost(url);
    if (!host) {
      return null;
    }
    const document = await this.file.readDocument();
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
    const plaintext = this.file.decryptFromBase64(entry.secretCiphertext);
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
}
