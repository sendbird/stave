import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { JiraConnectorCredentialVault } from "../electron/main/jira-connector/credential-vault";

const SITE_URL = "https://example.atlassian.net";
const EMAIL = "user@example.com";
const TOKEN = "test-only-api-token";

describe("JiraConnectorCredentialVault", () => {
  let root = "";
  let filePath = "";
  let available = true;
  let insecure = false;
  let vault: JiraConnectorCredentialVault;

  beforeEach(() => {
    available = true;
    insecure = false;
    root = path.join(
      tmpdir(),
      `stave-jira-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    filePath = path.join(root, "jira-connector.v1.json");
    vault = new JiraConnectorCredentialVault({
      filePath,
      crypto: {
        isEncryptionAvailable: () => available,
        isInsecureBackend: () => insecure,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) =>
          value.toString("utf8").replace(/^encrypted:/, ""),
      },
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function save(overrides: Partial<{ accountId: string }> = {}) {
    await vault.saveCredential({
      siteUrl: SITE_URL,
      authMode: "cloud-api-token",
      email: EMAIL,
      token: TOKEN,
      accountId: overrides.accountId ?? "account-1",
      displayName: "Test User",
    });
  }

  test("round-trips the credential and stores it only as ciphertext", async () => {
    await save();

    const raw = readFileSync(filePath, "utf8");
    expect(raw).not.toContain(TOKEN);
    expect(raw).not.toContain(EMAIL);
    expect(statSync(filePath).mode & 0o777).toBe(0o600);

    expect(await vault.getCredential()).toEqual({
      siteUrl: SITE_URL,
      authMode: "cloud-api-token",
      email: EMAIL,
      token: TOKEN,
      accountId: "account-1",
      displayName: "Test User",
    });
    expect(await vault.getMetadata()).toEqual({
      siteUrl: SITE_URL,
      authMode: "cloud-api-token",
      accountId: "account-1",
      displayName: "Test User",
    });

    expect(await vault.clear()).toBe(true);
    expect(await vault.getCredential()).toBeNull();
    expect(await vault.clear()).toBe(false);
  });

  test("fails closed when encryption is unavailable or insecure", async () => {
    available = false;
    expect(vault.isSecureStorageAvailable()).toBe(false);
    await expect(vault.getCredential()).rejects.toThrow(
      "OS credential encryption is unavailable",
    );
    await expect(save()).rejects.toThrow(
      "OS credential encryption is unavailable",
    );

    available = true;
    insecure = true;
    expect(vault.isSecureStorageAvailable()).toBe(false);
    await expect(save()).rejects.toThrow("basic_text");
    await expect(vault.getMetadata()).rejects.toThrow("basic_text");
  });

  test("refuses to read a document whose ciphertext is plain text", async () => {
    writeFileSync(
      filePath,
      `${JSON.stringify({
        version: 1,
        credential: {
          siteUrl: SITE_URL,
          authMode: "cloud-api-token",
          emailCiphertext: Buffer.from(EMAIL, "utf8").toString("base64"),
          tokenCiphertext: Buffer.from(TOKEN, "utf8").toString("base64"),
          accountId: "account-1",
          displayName: "Test User",
        },
      })}\n`,
      { mode: 0o600 },
    );

    await expect(vault.getCredential()).rejects.toThrow("plain text");
    // Metadata stays readable: the Settings surface has to be able to show
    // which site the unusable credential belonged to.
    expect((await vault.getMetadata())?.siteUrl).toBe(SITE_URL);
  });

  test("refuses to write when the crypto hands the plaintext back", async () => {
    const passthrough = new JiraConnectorCredentialVault({
      filePath: path.join(root, "passthrough.json"),
      crypto: {
        isEncryptionAvailable: () => true,
        isInsecureBackend: () => false,
        encryptString: (value) => Buffer.from(value, "utf8"),
        decryptString: (value) => value.toString("utf8"),
      },
    });

    await expect(
      passthrough.saveCredential({
        siteUrl: SITE_URL,
        authMode: "cloud-api-token",
        email: EMAIL,
        token: TOKEN,
        accountId: null,
        displayName: null,
      }),
    ).rejects.toThrow("refusing to store it as plain text");
  });

  test("serializes concurrent mutations", async () => {
    await Promise.all([
      save({ accountId: "account-1" }),
      save({ accountId: "account-2" }),
      save({ accountId: "account-3" }),
      vault.clear(),
      save({ accountId: "account-4" }),
    ]);

    // The last enqueued mutation is the one on disk, and the document is intact
    // rather than a half-written interleaving of two writers.
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    expect(parsed.credential.accountId).toBe("account-4");
    expect(await vault.getCredential()).toMatchObject({
      accountId: "account-4",
      token: TOKEN,
    });
  });
});
