import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CraneConnectorCredentialVault } from "../electron/main/crane-connector/credential-vault";

const CONNECTOR = {
  id: "connector-1",
  name: "Jacob's Stave",
  protocolVersion: 1,
  appVersion: "1.0.0",
  capabilities: ["run_task"],
  createdAt: "2026-07-26T00:00:00.000Z",
  lastSeenAt: "2026-07-26T00:00:00.000Z",
} as const;

describe("CraneConnectorCredentialVault", () => {
  let root = "";
  let filePath = "";
  let available = true;
  let insecure = false;
  let vault: CraneConnectorCredentialVault;

  beforeEach(() => {
    available = true;
    insecure = false;
    root = path.join(
      tmpdir(),
      `stave-crane-vault-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    filePath = path.join(root, "vault.json");
    vault = new CraneConnectorCredentialVault({
      filePath,
      crypto: {
        isEncryptionAvailable: () => available,
        isInsecureBackend: () => insecure,
        encryptString: (value) =>
          Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) =>
          value.toString("utf8").replace(/^encrypted:/, ""),
      },
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("stores connector and lease secrets only as ciphertext", async () => {
    await vault.saveCredential({
      baseUrl: "https://atelier.delight-tools.ai",
      connector: CONNECTOR,
      secret: "stc_test-only-connector-secret",
    });
    await vault.putLease({
      jobId: "job-1",
      connectorId: CONNECTOR.id,
      leaseId: "stl_test-only-job-lease",
      expiresAt: "2026-07-26T00:15:00.000Z",
    });

    const raw = readFileSync(filePath, "utf8");
    expect(raw).not.toContain("stc_test-only-connector-secret");
    expect(raw).not.toContain("stl_test-only-job-lease");
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(await vault.getCredential()).toEqual({
      baseUrl: "https://atelier.delight-tools.ai",
      connector: CONNECTOR,
      secret: "stc_test-only-connector-secret",
    });
    expect(await vault.getLease("job-1")).toEqual({
      jobId: "job-1",
      connectorId: CONNECTOR.id,
      leaseId: "stl_test-only-job-lease",
      expiresAt: "2026-07-26T00:15:00.000Z",
    });
  });

  test("fails closed for unavailable or basic_text encryption", async () => {
    available = false;
    await expect(vault.getCredential()).rejects.toThrow(
      "OS credential encryption is unavailable",
    );

    available = true;
    insecure = true;
    await expect(
      vault.saveCredential({
        baseUrl: "https://atelier.delight-tools.ai",
        connector: CONNECTOR,
        secret: "stc_test-only-connector-secret",
      }),
    ).rejects.toThrow("basic_text");
  });

  test("removes connector and lease material together", async () => {
    await vault.saveCredential({
      baseUrl: "https://atelier.delight-tools.ai",
      connector: CONNECTOR,
      secret: "stc_test-only-connector-secret",
    });
    await vault.putLease({
      jobId: "job-1",
      connectorId: CONNECTOR.id,
      leaseId: "stl_test-only-job-lease",
      expiresAt: "2026-07-26T00:15:00.000Z",
    });

    expect(await vault.clear()).toBe(true);
    expect(await vault.getCredential()).toBeNull();
    expect(await vault.getLease("job-1")).toBeNull();
  });
});
