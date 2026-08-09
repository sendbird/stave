import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AtelierConnectorCredentialVault } from "../electron/main/atelier-connector/credential-vault";

const CONNECTOR = {
  id: "connector-1",
  name: "Personal Stave",
  protocolVersion: 1,
  appVersion: "1.0.0",
  capabilities: ["run_task"],
  createdAt: "2026-08-09T00:00:00.000Z",
  lastSeenAt: "2026-08-09T00:00:00.000Z",
} as const;

describe("AtelierConnectorCredentialVault", () => {
  let root = "";
  let filePath = "";
  let legacyFilePath = "";
  let insecure = false;

  const createVault = () =>
    new AtelierConnectorCredentialVault({
      filePath,
      legacyCraneFilePath: legacyFilePath,
      crypto: {
        isEncryptionAvailable: () => true,
        isInsecureBackend: () => insecure,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) =>
          value.toString("utf8").replace(/^encrypted:/, ""),
      },
    });

  beforeEach(() => {
    insecure = false;
    root = path.join(
      tmpdir(),
      `stave-atelier-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    filePath = path.join(root, "atelier-connector.v1.json");
    legacyFilePath = path.join(root, "crane-connector.v1.json");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("round-trips granted scopes with the encrypted credential", async () => {
    const vault = createVault();
    await vault.saveCredential({
      baseUrl: "https://atelier.example.test",
      connector: CONNECTOR,
      scopes: ["crane", "hirondelle"],
      secret: "stc_test-only-connector-secret",
    });
    expect(await vault.getCredential()).toEqual({
      baseUrl: "https://atelier.example.test",
      connector: CONNECTOR,
      scopes: ["crane", "hirondelle"],
      secret: "stc_test-only-connector-secret",
    });
    expect(readFileSync(filePath, "utf8")).not.toContain(
      "stc_test-only-connector-secret",
    );
  });

  test("defaults credentials saved by the crane runtime to crane-only", async () => {
    const vault = createVault();
    await vault.saveCredential({
      baseUrl: "https://atelier.example.test",
      connector: CONNECTOR,
      secret: "stc_test-only-connector-secret",
    });
    expect((await vault.getCredential())?.scopes).toEqual(["crane"]);
  });

  test("migrates the legacy vault once and preserves leases", async () => {
    writeFileSync(
      legacyFilePath,
      `${JSON.stringify({
        version: 1,
        connector: {
          baseUrl: "https://atelier.example.test",
          metadata: CONNECTOR,
          secretCiphertext: Buffer.from(
            "encrypted:stc_legacy",
            "utf8",
          ).toString("base64"),
        },
        leases: [
          {
            jobId: "job-1",
            connectorId: CONNECTOR.id,
            leaseCiphertext: Buffer.from(
              "encrypted:stl_legacy",
              "utf8",
            ).toString("base64"),
            expiresAt: "2026-08-09T00:15:00.000Z",
          },
        ],
      }, null, 2)}\n`,
      "utf8",
    );

    const vault = createVault();
    expect(await vault.getCredential()).toEqual({
      baseUrl: "https://atelier.example.test",
      connector: CONNECTOR,
      scopes: ["crane"],
      secret: "stc_legacy",
    });
    expect(await vault.getLease("job-1")).toMatchObject({
      leaseId: "stl_legacy",
    });
    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(legacyFilePath)).toBe(false);

    const second = createVault();
    expect((await second.getCredential())?.secret).toBe("stc_legacy");
    expect(existsSync(legacyFilePath)).toBe(false);
  });

  test("ignores but preserves a corrupted legacy vault", async () => {
    writeFileSync(legacyFilePath, "not-json", "utf8");
    expect(await createVault().getCredential()).toBeNull();
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(legacyFilePath)).toBe(true);
  });

  test("fails closed for an insecure encryption backend", async () => {
    insecure = true;
    await expect(createVault().getCredential()).rejects.toThrow("basic_text");
  });
});
