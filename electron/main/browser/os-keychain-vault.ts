import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * The OS keychain encryption a vault file relies on (Electron `safeStorage`
 * in production). `isInsecureBackend` reports Electron's `basic_text`
 * fallback, which stores data under a hard-coded key and is refused.
 */
export interface OsKeychainCrypto {
  isEncryptionAvailable(): boolean;
  isInsecureBackend(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

/**
 * One JSON vault file whose secret fields are encrypted with the OS keychain.
 *
 * It owns what every vault shares: refusing to run without a secure keychain
 * backend, base64 ciphertext encoding, reading the file (absent means empty),
 * writing it atomically with owner-only permissions, and serializing
 * mutations. The caller owns the document schema and its error copy. This
 * class never logs, and its errors never carry a plaintext or ciphertext.
 */
export class OsKeychainVaultFile<TDocument> {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly args: {
      filePath: string;
      crypto: OsKeychainCrypto;
      /** Starts the basic_text refusal, e.g. "Secret storage". */
      storageLabel: string;
      /** Names the file in format errors, e.g. "secret vault". */
      documentLabel: string;
      emptyDocument: () => TDocument;
      /** Returns the document, or `null` when the JSON has another shape. */
      parseDocument: (parsed: unknown) => TDocument | null;
    },
  ) {}

  assertSecureEncryption(): void {
    if (!this.args.crypto.isEncryptionAvailable()) {
      throw new Error(
        "OS credential encryption is unavailable. Unlock the system credential store and retry.",
      );
    }
    if (this.args.crypto.isInsecureBackend()) {
      throw new Error(
        `${this.args.storageLabel} requires an OS credential store; Electron basic_text encryption is not accepted.`,
      );
    }
  }

  encryptToBase64(plaintext: string): string {
    return this.args.crypto.encryptString(plaintext).toString("base64");
  }

  /** Throws the keychain's own error; callers replace it with domain copy. */
  decryptFromBase64(ciphertext: string): string {
    return this.args.crypto.decryptString(Buffer.from(ciphertext, "base64"));
  }

  async readDocument(): Promise<TDocument> {
    let raw: string;
    try {
      raw = await fs.readFile(this.args.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.args.emptyDocument();
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`The ${this.args.documentLabel} is not valid JSON.`);
    }
    const document = this.args.parseDocument(parsed);
    if (document === null) {
      throw new Error(
        `The ${this.args.documentLabel} has an unsupported format.`,
      );
    }
    return document;
  }

  async writeDocument(document: TDocument): Promise<void> {
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

  /** Runs read-modify-write operations one at a time, even after a failure. */
  enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
