import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SecretVault } from "../electron/main/browser/secret-vault";
import {
  SecretDeleteArgsSchema,
  SecretRevealArgsSchema,
  SecretUpsertArgsSchema,
} from "../electron/main/ipc/schemas";
import {
  buildSecretPreview,
  normalizeSecretName,
} from "../src/lib/secrets/secrets";

const tempDirs: string[] = [];

function createHarness(options?: {
  encryptionAvailable?: boolean;
  insecureBackend?: boolean;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-secrets-"));
  tempDirs.push(directory);
  const filePath = path.join(directory, "secrets.v1.json");
  let timestamp = 0;
  let id = 0;
  const vault = new SecretVault({
    filePath,
    crypto: {
      isEncryptionAvailable: () => options?.encryptionAvailable ?? true,
      isInsecureBackend: () => options?.insecureBackend ?? false,
      encryptString: (value) =>
        Buffer.from(`sealed:${Buffer.from(value).toString("base64")}`),
      decryptString: (value) =>
        Buffer.from(
          value.toString().slice("sealed:".length),
          "base64",
        ).toString(),
    },
    createId: () =>
      `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    now: () => `2026-07-22T00:00:0${timestamp++}.000Z`,
  });
  return { filePath, vault };
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("buildSecretPreview", () => {
  test("masks short values fully and reveals only the last four otherwise", () => {
    expect(buildSecretPreview("")).toBe("");
    expect(buildSecretPreview("ab")).toBe("••");
    expect(buildSecretPreview("sk-1234567890")).toBe("••••7890");
  });
});

describe("normalizeSecretName", () => {
  test("trims and rejects blank names", () => {
    expect(normalizeSecretName("  OpenAI  ")).toBe("OpenAI");
    expect(normalizeSecretName("   ")).toBeNull();
  });
});

describe("Secret IPC schemas", () => {
  test("accepts bounded upsert payloads", () => {
    expect(
      SecretUpsertArgsSchema.safeParse({
        name: "OpenAI",
        value: "sk-secret",
      }).success,
    ).toBe(true);
    expect(
      SecretUpsertArgsSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        name: "OpenAI",
        description: "used by the agent",
      }).success,
    ).toBe(true);
  });

  test("rejects empty names, malformed ids, and unknown fields", () => {
    expect(SecretUpsertArgsSchema.safeParse({ name: "" }).success).toBe(false);
    expect(SecretDeleteArgsSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(SecretRevealArgsSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(
      SecretUpsertArgsSchema.safeParse({
        name: "OpenAI",
        value: "sk-secret",
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("SecretVault", () => {
  test("stores only ciphertext and returns metadata without the value", async () => {
    const { filePath, vault } = createHarness();
    const saved = await vault.upsert({
      name: "OpenAI",
      description: "agent token",
      value: "sk-plain-secret-value",
    });

    expect(saved.name).toBe("OpenAI");
    expect(saved.valuePreview).toBe("••••alue");
    expect(saved).not.toHaveProperty("value");
    expect(await vault.list()).toEqual([saved]);
    const persisted = readFileSync(filePath, "utf8");
    expect(persisted).not.toContain("sk-plain-secret-value");
    expect(persisted).toContain("valueCiphertext");
  });

  test("reveals the value only on explicit request", async () => {
    const { vault } = createHarness();
    const saved = await vault.upsert({
      name: "OpenAI",
      value: "sk-plain-secret-value",
    });

    expect(await vault.reveal(saved.id)).toEqual({
      id: saved.id,
      value: "sk-plain-secret-value",
    });
    expect(await vault.reveal("00000000-0000-4000-8000-999999999999")).toBeNull();
  });

  test("preserves the encrypted value during metadata-only edits", async () => {
    const { filePath, vault } = createHarness();
    const saved = await vault.upsert({
      name: "OpenAI",
      value: "keep-this-secret",
    });
    const updated = await vault.upsert({
      id: saved.id,
      name: "OpenAI renamed",
      description: "now documented",
    });

    expect(updated.name).toBe("OpenAI renamed");
    expect(updated.valuePreview).toBe(saved.valuePreview);
    const persisted = readFileSync(filePath, "utf8");
    expect(persisted).not.toContain("keep-this-secret");
    expect(await vault.reveal(saved.id)).toEqual({
      id: saved.id,
      value: "keep-this-secret",
    });
  });

  test("rejects a duplicate name (case-insensitive)", async () => {
    const { vault } = createHarness();
    await vault.upsert({ name: "OpenAI", value: "one" });
    await expect(
      vault.upsert({ name: "openai", value: "two" }),
    ).rejects.toThrow("already exists");
  });

  test("requires a value for a new secret", async () => {
    const { vault } = createHarness();
    await expect(vault.upsert({ name: "OpenAI" })).rejects.toThrow(
      "value is required",
    );
  });

  test("deletes the encrypted entry", async () => {
    const { vault } = createHarness();
    const saved = await vault.upsert({ name: "OpenAI", value: "secret" });

    expect(await vault.delete(saved.id)).toBe(true);
    expect(await vault.delete(saved.id)).toBe(false);
    expect(await vault.list()).toEqual([]);
  });

  test("refuses unavailable or insecure encryption backends", async () => {
    const unavailable = createHarness({ encryptionAvailable: false }).vault;
    await expect(
      unavailable.upsert({ name: "OpenAI", value: "secret" }),
    ).rejects.toThrow("encryption is unavailable");

    const insecure = createHarness({ insecureBackend: true }).vault;
    await expect(
      insecure.upsert({ name: "OpenAI", value: "secret" }),
    ).rejects.toThrow("basic_text");
  });

  test("fails closed when the vault document is malformed", async () => {
    const { filePath, vault } = createHarness();
    writeFileSync(filePath, "{not-json", "utf8");
    await expect(vault.list()).rejects.toThrow("not valid JSON");
  });
});
