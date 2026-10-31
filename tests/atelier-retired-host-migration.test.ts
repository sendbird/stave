// Registered as `atelier-retired-host` in config/temporary-migrations.json.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AtelierConnectorCredentialVault } from "../electron/main/atelier-connector/credential-vault";
import {
  migrateCraneConnectorRetiredHost,
  migrateRetiredAtelierBaseUrl,
} from "../src/lib/atelier-connector/retired-host-migration";
import type { CraneConnectorSettings } from "../src/lib/crane-connector/types";

const RETIRED = "https://atelier.delight-tools.ai";
const CURRENT = "https://atelier.sdix.io";

describe("temporary migration: atelier-retired-host", () => {
  test("reads the retired host, in any form the normalizer accepts, as the new UI host", () => {
    for (const value of [
      RETIRED,
      `${RETIRED}/`,
      `${RETIRED}//`,
      ` ${RETIRED}/ `,
      "https://ATELIER.delight-tools.ai",
      "https://atelier.delight-tools.ai:443/",
    ]) {
      expect(migrateRetiredAtelierBaseUrl(value)).toBe(CURRENT);
    }
    // Only the host changes; a path still reaches the normalizer as before.
    expect(migrateRetiredAtelierBaseUrl(`${RETIRED}/apps/crane`)).toBe(
      `${CURRENT}/apps/crane`,
    );
    expect(migrateRetiredAtelierBaseUrl(`${RETIRED}//evil.test/x`)).toBe(
      `${CURRENT}//evil.test/x`,
    );
  });

  test("leaves every other host alone, so running it again changes nothing", () => {
    for (const value of [
      CURRENT,
      "https://api.atelier.sdix.io",
      "http://localhost:8181",
      "https://atelier.example.test",
      "https://atelier.delight-tools.ai.example.test",
      "http://atelier.delight-tools.ai",
      "https://user:pass@atelier.delight-tools.ai",
      "not a url",
    ]) {
      expect(migrateRetiredAtelierBaseUrl(value)).toBe(value);
    }
    expect(
      migrateRetiredAtelierBaseUrl(migrateRetiredAtelierBaseUrl(RETIRED)),
    ).toBe(CURRENT);
  });

  describe("Crane connector settings", () => {
    const savedConnector = (baseUrl: string): CraneConnectorSettings => ({
      enabled: true,
      baseUrl,
      pollIntervalSeconds: 30,
      repositoryMappings: [
        { craneTeamKey: "FRONTEND", staveProjectPath: "/tmp/project" },
      ],
    });

    /** Runs the real store rehydration, which calls the migration before normalizing. */
    async function rehydrate(settings: Record<string, unknown>) {
      const values = new Map<string, string>();
      (globalThis as { window?: unknown }).window = {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => void values.set(key, value),
          removeItem: (key: string) => void values.delete(key),
        },
        api: {},
      };
      const { useAppStore } = await import("../src/store/app.store");
      const { createAppStorePersistenceOptions } = await import(
        "../src/store/app-store-persistence"
      );
      const options = createAppStorePersistenceOptions();
      const state = {
        ...useAppStore.getInitialState(),
        settings,
      } as never as { settings: { craneConnector: CraneConnectorSettings } };
      options.onRehydrateStorage()(state as never);
      return {
        settings: state.settings,
        saved: options.partialize(state as never) as {
          settings: { craneConnector: CraneConnectorSettings };
        },
      };
    }

    test("a connector saved for the retired host rehydrates on the new host and keeps the rest", async () => {
      const { settings, saved } = await rehydrate({
        craneConnector: savedConnector(`${RETIRED}/`),
      });
      expect(settings.craneConnector).toEqual(savedConnector(CURRENT));
      // What the next save writes back to storage.
      expect(saved.settings.craneConnector.baseUrl).toBe(CURRENT);
    });

    test("a connector on another host keeps it", async () => {
      const { settings } = await rehydrate({
        craneConnector: savedConnector("http://localhost:8181"),
      });
      expect(settings.craneConnector.baseUrl).toBe("http://localhost:8181");
    });

    test("ignores settings without a readable connector", () => {
      const missing: Record<string, unknown> = {};
      migrateCraneConnectorRetiredHost(missing);
      expect(missing).toEqual({});
      const malformed: Record<string, unknown> = {
        craneConnector: { baseUrl: 42 },
      };
      migrateCraneConnectorRetiredHost(malformed);
      expect(malformed).toEqual({ craneConnector: { baseUrl: 42 } });
    });
  });

  describe("Atelier connector vault", () => {
    const CONNECTOR = {
      id: "connector-1",
      name: "Personal Stave",
      protocolVersion: 1,
      appVersion: "1.0.0",
      capabilities: ["run_task"],
      createdAt: "2026-08-09T00:00:00.000Z",
      lastSeenAt: "2026-08-09T00:00:00.000Z",
    } as const;
    const encrypted = (value: string) =>
      Buffer.from(`encrypted:${value}`, "utf8").toString("base64");

    let root = "";
    let filePath = "";
    let legacyFilePath = "";

    const createVault = () =>
      new AtelierConnectorCredentialVault({
        filePath,
        legacyCraneFilePath: legacyFilePath,
        crypto: {
          isEncryptionAvailable: () => true,
          isInsecureBackend: () => false,
          encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
          decryptString: (value) =>
            value.toString("utf8").replace(/^encrypted:/, ""),
        },
      });

    const writeVault = (target: string, baseUrl: string, scoped: boolean) =>
      writeFileSync(
        target,
        `${JSON.stringify({
          version: 1,
          connector: {
            baseUrl,
            metadata: CONNECTOR,
            ...(scoped ? { scopes: ["crane", "martin"] } : {}),
            secretCiphertext: encrypted("stc_saved-secret"),
          },
          leases: [
            {
              jobId: "job-1",
              connectorId: CONNECTOR.id,
              leaseCiphertext: encrypted("stl_saved-lease"),
              expiresAt: "2026-08-09T00:15:00.000Z",
            },
          ],
        })}\n`,
        "utf8",
      );

    const savedBaseUrl = (target: string) =>
      (JSON.parse(readFileSync(target, "utf8")) as {
        connector: { baseUrl: string };
      }).connector.baseUrl;

    beforeEach(() => {
      root = path.join(
        tmpdir(),
        `stave-atelier-host-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      filePath = path.join(root, "atelier-connector.v1.json");
      legacyFilePath = path.join(root, "crane-connector.v1.json");
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    test("a pairing saved for the retired host reads on the new host and keeps its secret", async () => {
      writeVault(filePath, RETIRED, true);
      const vault = createVault();

      expect(await vault.getCredential()).toEqual({
        baseUrl: CURRENT,
        connector: CONNECTOR,
        scopes: ["crane", "martin"],
        secret: "stc_saved-secret",
      });
      expect((await vault.getMetadata())?.baseUrl).toBe(CURRENT);
      expect((await vault.getLease("job-1"))?.leaseId).toBe("stl_saved-lease");
      // Reading does not write; the next save does.
      expect(savedBaseUrl(filePath)).toBe(RETIRED);

      await vault.deleteLease("job-1");
      expect(savedBaseUrl(filePath)).toBe(CURRENT);
      expect((await createVault().getCredential())?.secret).toBe(
        "stc_saved-secret",
      );
    });

    test("a legacy Crane vault on the retired host is imported on the new host", async () => {
      writeVault(legacyFilePath, RETIRED, false);

      expect((await createVault().getCredential())?.baseUrl).toBe(CURRENT);
      expect(savedBaseUrl(filePath)).toBe(CURRENT);
    });

    test("a pairing on another host keeps it", async () => {
      writeVault(filePath, "http://localhost:8181", true);

      expect((await createVault().getCredential())?.baseUrl).toBe(
        "http://localhost:8181",
      );
    });
  });
});
