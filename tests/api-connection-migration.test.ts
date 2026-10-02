import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { VERCEL_AI_GATEWAY } from "../src/lib/providers/api-connections";

// Exists only for the claude-gateway-api-connections temporary migration
// (config/temporary-migrations.json); delete it with that migration.
const secretId = "11111111-1111-4111-8111-111111111111";
const otherSecretId = "22222222-2222-4222-8222-222222222222";
let root: string;
let registry: ProviderAccountRegistry;
beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-gateway-migration-")));
  registry = new ProviderAccountRegistry(root);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("Claude gateway accounts become API connections", () => {
  function writeLegacyRegistry() {
    const vercelDir = path.join(root, "provider-accounts", "33333333-3333-4333-8333-333333333333");
    const customDir = path.join(root, "provider-accounts", "44444444-4444-4444-8444-444444444444");
    const nativeDir = path.join(root, "provider-accounts", "55555555-5555-4555-8555-555555555555");
    for (const dir of [vercelDir, customDir, nativeDir]) mkdirSync(dir, { recursive: true });
    writeFileSync(registry.filePath, JSON.stringify({ version: 1, profiles: [
      { id: "33333333-3333-4333-8333-333333333333", providerId: "claude-code", label: "Vercel", kind: "managed", configDirectory: vercelDir,
        gateway: { baseUrl: VERCEL_AI_GATEWAY.endpoints["claude-code"], secretId, models: ["anthropic/claude-sonnet-5", "anthropic/claude-haiku-4.5"] } },
      { id: "44444444-4444-4444-8444-444444444444", providerId: "claude-code", label: "Proxy", kind: "managed", configDirectory: customDir,
        gateway: { baseUrl: "https://proxy.example.test/anthropic", secretId: otherSecretId, models: ["claude-sonnet-5[1m]"] } },
      { id: "55555555-5555-4555-8555-555555555555", providerId: "codex", label: "Work", kind: "managed", configDirectory: nativeDir },
    ] }));
    return { vercelDir, customDir };
  }

  test("reads the older shape as connections with the same ids, folders and selections", () => {
    const { vercelDir, customDir } = writeLegacyRegistry();
    const list = registry.list();
    const vercelEntries = list.filter((profile) => profile.id === "33333333-3333-4333-8333-333333333333");
    // The Vercel key serves Codex too, through its Codex endpoint.
    expect(vercelEntries.map((profile) => [profile.providerId, profile.gateway?.baseUrl])).toEqual([
      ["claude-code", VERCEL_AI_GATEWAY.endpoints["claude-code"]],
      ["codex", VERCEL_AI_GATEWAY.endpoints.codex],
    ]);
    expect(list.filter((profile) => profile.id === "44444444-4444-4444-8444-444444444444").map((profile) => profile.providerId)).toEqual(["claude-code"]);
    expect(list.find((profile) => profile.label === "Work")?.gateway).toBeUndefined();
    // Session history stays where Claude kept it.
    expect(registry.resolveDirectory({ providerId: "claude-code", profileId: "33333333-3333-4333-8333-333333333333" })).toBe(vercelDir);
    expect(registry.resolveDirectory({ providerId: "claude-code", profileId: "44444444-4444-4444-8444-444444444444" })).toBe(customDir);
    expect(registry.resolveGateway("44444444-4444-4444-8444-444444444444")).toEqual({ baseUrl: "https://proxy.example.test/anthropic", secretId: otherSecretId, models: ["claude-sonnet-5[1m]"] });
    expect(registry.listApiConnections().map((connection) => connection.kind)).toEqual(["vercel-ai-gateway", "custom"]);
  });

  test("persists once, idempotently, and keeps sign-in accounts", () => {
    writeLegacyRegistry();
    const before = registry.list();
    expect(registry.persistMigrations()).toBe(2);
    const stored = JSON.parse(readFileSync(registry.filePath, "utf8"));
    expect(stored.profiles.map((profile: { label: string }) => profile.label)).toEqual(["Work"]);
    expect(stored.profiles.some((profile: { gateway?: unknown }) => profile.gateway)).toBe(false);
    expect(stored.connections).toHaveLength(2);
    expect(registry.persistMigrations()).toBe(0);
    expect(registry.list()).toEqual(before);
  });

  test("an older write that left a gateway beside its connection is dropped, not duplicated", () => {
    writeLegacyRegistry();
    registry.persistMigrations();
    const stored = JSON.parse(readFileSync(registry.filePath, "utf8"));
    const legacy = { id: "33333333-3333-4333-8333-333333333333", providerId: "claude-code", label: "Vercel", kind: "managed",
      configDirectory: path.join(root, "provider-accounts", "66666666-6666-4666-8666-666666666666"),
      gateway: { baseUrl: VERCEL_AI_GATEWAY.endpoints["claude-code"], secretId, models: ["anthropic/claude-sonnet-5"] } };
    writeFileSync(registry.filePath, JSON.stringify({ ...stored, profiles: [...stored.profiles, legacy] }));
    expect(registry.listApiConnections()).toHaveLength(2);
  });

  test("a gateway on a Codex account is invalid storage, as before", () => {
    mkdirSync(path.join(root, "provider-accounts", "x"), { recursive: true });
    writeFileSync(registry.filePath, JSON.stringify({ version: 1, profiles: [
      { id: "33333333-3333-4333-8333-333333333333", providerId: "codex", label: "Bad", kind: "managed", configDirectory: path.join(root, "provider-accounts", "x"),
        gateway: { baseUrl: "https://proxy.example.test", secretId, models: ["claude-sonnet-5"] } },
    ] }));
    expect(() => registry.list()).toThrow("storage is invalid");
  });
});
