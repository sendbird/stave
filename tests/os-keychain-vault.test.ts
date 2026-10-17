import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LensCredentialVault } from "../electron/main/browser/lens-credential-vault";
import {
  OsKeychainVaultFile,
  type OsKeychainCrypto,
} from "../electron/main/browser/os-keychain-vault";
import { SecretVault } from "../electron/main/browser/secret-vault";

const tempDirs: string[] = [];

function tempFile(name: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-keychain-vault-"));
  tempDirs.push(directory);
  return path.join(directory, name);
}

function crypto(options?: {
  encryptionAvailable?: boolean;
  insecureBackend?: boolean;
}): OsKeychainCrypto {
  return {
    isEncryptionAvailable: () => options?.encryptionAvailable ?? true,
    isInsecureBackend: () => options?.insecureBackend ?? false,
    encryptString: (value) => Buffer.from(`sealed:${value}`),
    decryptString: (value) => value.toString().slice("sealed:".length),
  };
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("OsKeychainVaultFile", () => {
  test("reads a missing file as the empty document and writes it owner-only without leftovers", async () => {
    const filePath = tempFile("vault.json");
    const file = new OsKeychainVaultFile<{ items: string[] }>({
      filePath,
      crypto: crypto(),
      storageLabel: "Test storage",
      documentLabel: "test vault",
      emptyDocument: () => ({ items: [] }),
      parseDocument: (parsed) => parsed as { items: string[] },
    });
    expect(await file.readDocument()).toEqual({ items: [] });
    await file.writeDocument({ items: ["a"] });
    expect(await file.readDocument()).toEqual({ items: ["a"] });
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(readdirSync(path.dirname(filePath))).toEqual(["vault.json"]);
  });

  test("round-trips ciphertext through base64", () => {
    const file = new OsKeychainVaultFile({
      filePath: tempFile("vault.json"),
      crypto: crypto(),
      storageLabel: "Test storage",
      documentLabel: "test vault",
      emptyDocument: () => null,
      parseDocument: () => null,
    });
    const ciphertext = file.encryptToBase64("value");
    expect(ciphertext).toBe(Buffer.from("sealed:value").toString("base64"));
    expect(file.decryptFromBase64(ciphertext)).toBe("value");
  });
});

describe("vault error copy stays per storage domain", () => {
  test("secret vault", async () => {
    const filePath = tempFile("secrets.v1.json");
    await expect(
      new SecretVault({ filePath, crypto: crypto({ encryptionAvailable: false }) }).list(),
    ).rejects.toThrow(
      "OS credential encryption is unavailable. Unlock the system credential store and retry.",
    );
    await expect(
      new SecretVault({ filePath, crypto: crypto({ insecureBackend: true }) }).list(),
    ).rejects.toThrow(
      "Secret storage requires an OS credential store; Electron basic_text encryption is not accepted.",
    );
    writeFileSync(filePath, "{");
    await expect(new SecretVault({ filePath, crypto: crypto() }).list()).rejects.toThrow(
      "The secret vault is not valid JSON.",
    );
    writeFileSync(filePath, JSON.stringify({ version: 9, secrets: [] }));
    await expect(new SecretVault({ filePath, crypto: crypto() }).list()).rejects.toThrow(
      "The secret vault has an unsupported format.",
    );
  });

  test("Lens account vault", async () => {
    const filePath = tempFile("lens-credentials.json");
    await expect(
      new LensCredentialVault({ filePath, crypto: crypto({ encryptionAvailable: false }) }).list(),
    ).rejects.toThrow(
      "OS credential encryption is unavailable. Unlock the system credential store and retry.",
    );
    await expect(
      new LensCredentialVault({ filePath, crypto: crypto({ insecureBackend: true }) }).list(),
    ).rejects.toThrow(
      "Lens account storage requires an OS credential store; Electron basic_text encryption is not accepted.",
    );
    writeFileSync(filePath, "{");
    await expect(new LensCredentialVault({ filePath, crypto: crypto() }).list()).rejects.toThrow(
      "The Lens account vault is not valid JSON.",
    );
    writeFileSync(filePath, JSON.stringify({ version: 9, credentials: [] }));
    await expect(new LensCredentialVault({ filePath, crypto: crypto() }).list()).rejects.toThrow(
      "The Lens account vault has an unsupported format.",
    );
  });
});
