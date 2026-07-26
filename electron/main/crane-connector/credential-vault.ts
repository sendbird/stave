import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CraneConnectorMetadataSchema,
  type CraneConnectorMetadata,
} from "../../../src/lib/crane-connector/types";

const VAULT_VERSION = 1;

const StoredConnectorSchema = z
  .object({
    baseUrl: z.string().url().max(2_048),
    metadata: CraneConnectorMetadataSchema,
    secretCiphertext: z.string().min(1),
  })
  .strict();

const StoredLeaseSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
    connectorId: z.string().trim().min(1).max(128),
    leaseCiphertext: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const VaultDocumentSchema = z
  .object({
    version: z.literal(VAULT_VERSION),
    connector: StoredConnectorSchema.nullable(),
    leases: z.array(StoredLeaseSchema).max(100),
  })
  .strict();

export interface CraneCredentialVaultCrypto {
  isEncryptionAvailable(): boolean;
  isInsecureBackend(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface CraneConnectorCredential {
  baseUrl: string;
  connector: CraneConnectorMetadata;
  secret: string;
}

export interface CraneConnectorLease {
  jobId: string;
  connectorId: string;
  leaseId: string;
  expiresAt: string;
}

export class CraneConnectorCredentialVault {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly args: {
      filePath: string;
      crypto: CraneCredentialVaultCrypto;
    },
  ) {}

  isSecureStorageAvailable() {
    return (
      this.args.crypto.isEncryptionAvailable() &&
      !this.args.crypto.isInsecureBackend()
    );
  }

  async getMetadata(): Promise<
    Omit<CraneConnectorCredential, "secret"> | null
  > {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    return document.connector
      ? {
          baseUrl: document.connector.baseUrl,
          connector: document.connector.metadata,
        }
      : null;
  }

  async getCredential(): Promise<CraneConnectorCredential | null> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    if (!document.connector) {
      return null;
    }
    const secret = this.decryptValue(
      document.connector.secretCiphertext,
      "connector credential",
    );
    if (!secret.startsWith("stc_") || secret.length > 128) {
      throw new Error("The saved Crane connector credential is invalid.");
    }
    return {
      baseUrl: document.connector.baseUrl,
      connector: document.connector.metadata,
      secret,
    };
  }

  async saveCredential(input: CraneConnectorCredential): Promise<void> {
    await this.enqueueMutation(async () => {
      this.assertSecureEncryption();
      if (!input.secret.startsWith("stc_") || input.secret.length > 128) {
        throw new Error("The Crane connector credential is invalid.");
      }
      const metadata = CraneConnectorMetadataSchema.parse(input.connector);
      const document = await this.readDocument();
      await this.writeDocument({
        version: VAULT_VERSION,
        connector: {
          baseUrl: input.baseUrl.replace(/\/+$/, ""),
          metadata,
          secretCiphertext: this.encryptValue(input.secret),
        },
        leases: document.leases.filter(
          (lease) => lease.connectorId === metadata.id,
        ),
      });
    });
  }

  async clear(): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const document = await this.readDocument();
      if (!document.connector && document.leases.length === 0) {
        return false;
      }
      await this.writeDocument({
        version: VAULT_VERSION,
        connector: null,
        leases: [],
      });
      return true;
    });
  }

  async putLease(input: CraneConnectorLease): Promise<void> {
    await this.enqueueMutation(async () => {
      this.assertSecureEncryption();
      if (!input.leaseId.startsWith("stl_") || input.leaseId.length > 128) {
        throw new Error("The Crane job lease is invalid.");
      }
      const document = await this.readDocument();
      if (
        !document.connector ||
        document.connector.metadata.id !== input.connectorId
      ) {
        throw new Error("The Crane job lease does not match the connector.");
      }
      const nextLease = StoredLeaseSchema.parse({
        jobId: input.jobId,
        connectorId: input.connectorId,
        leaseCiphertext: this.encryptValue(input.leaseId),
        expiresAt: input.expiresAt,
      });
      await this.writeDocument({
        ...document,
        leases: [
          ...document.leases.filter(
            (lease) => lease.jobId !== input.jobId,
          ),
          nextLease,
        ],
      });
    });
  }

  async getLease(jobId: string): Promise<CraneConnectorLease | null> {
    this.assertSecureEncryption();
    const document = await this.readDocument();
    const lease =
      document.leases.find((candidate) => candidate.jobId === jobId) ??
      null;
    if (!lease) {
      return null;
    }
    const leaseId = this.decryptValue(
      lease.leaseCiphertext,
      "job lease",
    );
    if (!leaseId.startsWith("stl_") || leaseId.length > 128) {
      throw new Error("The saved Crane job lease is invalid.");
    }
    return {
      jobId: lease.jobId,
      connectorId: lease.connectorId,
      leaseId,
      expiresAt: lease.expiresAt,
    };
  }

  async deleteLease(jobId: string): Promise<boolean> {
    return this.enqueueMutation(async () => {
      const document = await this.readDocument();
      const nextLeases = document.leases.filter(
        (lease) => lease.jobId !== jobId,
      );
      if (nextLeases.length === document.leases.length) {
        return false;
      }
      await this.writeDocument({ ...document, leases: nextLeases });
      return true;
    });
  }

  private assertSecureEncryption(): void {
    if (!this.args.crypto.isEncryptionAvailable()) {
      throw new Error(
        "OS credential encryption is unavailable. Unlock the system credential store and retry.",
      );
    }
    if (this.args.crypto.isInsecureBackend()) {
      throw new Error(
        "Crane connector storage requires an OS credential store; Electron basic_text encryption is not accepted.",
      );
    }
  }

  private encryptValue(value: string) {
    return this.args.crypto.encryptString(value).toString("base64");
  }

  private decryptValue(ciphertext: string, label: string) {
    try {
      return this.args.crypto.decryptString(
        Buffer.from(ciphertext, "base64"),
      );
    } catch {
      throw new Error(`The saved Crane ${label} cannot be decrypted.`);
    }
  }

  private async readDocument(): Promise<
    z.infer<typeof VaultDocumentSchema>
  > {
    let raw: string;
    try {
      raw = await fs.readFile(this.args.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: VAULT_VERSION, connector: null, leases: [] };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The Crane connector vault is not valid JSON.");
    }
    const result = VaultDocumentSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        "The Crane connector vault has an unsupported format.",
      );
    }
    return result.data;
  }

  private async writeDocument(
    document: z.infer<typeof VaultDocumentSchema>,
  ): Promise<void> {
    const validated = VaultDocumentSchema.parse(document);
    const directory = path.dirname(this.args.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tempPath = `${this.args.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(
        tempPath,
        `${JSON.stringify(validated, null, 2)}\n`,
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );
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
