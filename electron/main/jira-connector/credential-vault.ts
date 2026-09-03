import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const VAULT_VERSION = 1;

const StoredCredentialSchema = z
  .object({
    siteUrl: z.string().url().max(2_048),
    authMode: z.enum(["cloud-api-token"]),
    emailCiphertext: z.string().min(1),
    tokenCiphertext: z.string().min(1),
    accountId: z.string().trim().min(1).max(128).nullable(),
    displayName: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

const JiraVaultDocumentSchema = z
  .object({
    version: z.literal(VAULT_VERSION),
    credential: StoredCredentialSchema.nullable(),
  })
  .strict();

type JiraVaultDocument = z.infer<typeof JiraVaultDocumentSchema>;

/**
 * The `safeStorage`-shaped surface the vault needs, injected so the vault can
 * be exercised without an Electron runtime.
 */
export interface JiraCredentialVaultCrypto {
  isEncryptionAvailable(): boolean;
  isInsecureBackend(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface JiraStoredCredential {
  siteUrl: string;
  authMode: "cloud-api-token";
  email: string;
  token: string;
  accountId: string | null;
  displayName: string | null;
}

export type JiraStoredCredentialMetadata = Omit<
  JiraStoredCredential,
  "email" | "token"
>;

export class JiraConnectorCredentialVault {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly args: {
      filePath: string;
      crypto: JiraCredentialVaultCrypto;
    },
  ) {}

  isSecureStorageAvailable() {
    return (
      this.args.crypto.isEncryptionAvailable() &&
      !this.args.crypto.isInsecureBackend()
    );
  }

  /** Everything the renderer-facing status needs, with no credential material. */
  async getMetadata(): Promise<JiraStoredCredentialMetadata | null> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    if (!document.credential) return null;
    return {
      siteUrl: document.credential.siteUrl,
      authMode: document.credential.authMode,
      accountId: document.credential.accountId,
      displayName: document.credential.displayName,
    };
  }

  async getCredential(): Promise<JiraStoredCredential | null> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    if (!document.credential) return null;
    const email = this.decryptValue(
      document.credential.emailCiphertext,
      "account email",
    );
    const token = this.decryptValue(
      document.credential.tokenCiphertext,
      "API token",
    );
    return {
      siteUrl: document.credential.siteUrl,
      authMode: document.credential.authMode,
      email,
      token,
      accountId: document.credential.accountId,
      displayName: document.credential.displayName,
    };
  }

  async saveCredential(input: JiraStoredCredential): Promise<void> {
    await this.enqueueMutation(async () => {
      this.assertSecureEncryption();
      if (input.email.length === 0 || input.token.length === 0) {
        throw new Error("The Jira credential is invalid.");
      }
      await this.writeDocument({
        version: VAULT_VERSION,
        credential: StoredCredentialSchema.parse({
          siteUrl: input.siteUrl.replace(/\/+$/, ""),
          authMode: input.authMode,
          emailCiphertext: this.encryptValue(input.email),
          tokenCiphertext: this.encryptValue(input.token),
          accountId: input.accountId,
          displayName: input.displayName,
        }),
      });
    });
  }

  async clear(): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const document = await this.readDocument();
      if (!document.credential) return false;
      await this.writeDocument({ version: VAULT_VERSION, credential: null });
      return true;
    });
  }

  private assertSecureEncryption() {
    if (!this.args.crypto.isEncryptionAvailable()) {
      throw new Error(
        "OS credential encryption is unavailable. Unlock the system credential store and retry.",
      );
    }
    if (this.args.crypto.isInsecureBackend()) {
      throw new Error(
        "Jira connector storage requires an OS credential store; Electron basic_text encryption is not accepted.",
      );
    }
  }

  private encryptValue(value: string) {
    const ciphertext = this.args.crypto.encryptString(value);
    // A backend that hands the plaintext straight back (basic_text, or a stub
    // that silently degraded) would write the API token to disk in the clear.
    // Refusing here is cheaper than discovering it on the next read.
    if (ciphertext.toString("utf8") === value) {
      throw new Error(
        "The Jira credential was not encrypted; refusing to store it as plain text.",
      );
    }
    return ciphertext.toString("base64");
  }

  private decryptValue(ciphertext: string, label: string) {
    const bytes = Buffer.from(ciphertext, "base64");
    let plaintext: string;
    try {
      plaintext = this.args.crypto.decryptString(bytes);
    } catch {
      throw new Error(`The saved Jira ${label} cannot be decrypted.`);
    }
    if (bytes.toString("utf8") === plaintext) {
      throw new Error(
        `The saved Jira ${label} is stored as plain text; re-enter the credential.`,
      );
    }
    return plaintext;
  }

  private async readDocument(): Promise<JiraVaultDocument> {
    try {
      const raw = await fs.readFile(this.args.filePath, "utf8");
      const parsed = JiraVaultDocumentSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error("The Jira connector vault has an unsupported format.");
      }
      return parsed.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { version: VAULT_VERSION, credential: null };
  }

  private async writeDocument(document: JiraVaultDocument): Promise<void> {
    const validated = JiraVaultDocumentSchema.parse(document);
    const directory = path.dirname(this.args.filePath);
    await fs.mkdir(directory, { recursive: true });
    // Same-directory temp file plus rename: the replacement is atomic, and the
    // ciphertext is never briefly readable at a wider mode.
    const tempPath = `${this.args.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(validated, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await fs.rename(tempPath, this.args.filePath);
      await fs.chmod(this.args.filePath, 0o600);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Mutations are serialized so a save racing a clear cannot interleave a read
   * of the old document with a write of the new one.
   */
  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
