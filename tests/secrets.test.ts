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
  isReservedEnvVarName,
  normalizeEnvVarName,
  normalizeSecretName,
} from "../src/lib/secrets/secrets";
import {
  appendPromptSecretReferenceContext,
  parsePromptSecretReferences,
} from "../src/lib/secrets/secret-references";

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

describe("normalizeEnvVarName", () => {
  test("returns undefined for blank input (not injectable)", () => {
    expect(normalizeEnvVarName(undefined)).toBeUndefined();
    expect(normalizeEnvVarName("")).toBeUndefined();
    expect(normalizeEnvVarName("   ")).toBeUndefined();
  });

  test("accepts and trims a valid POSIX name", () => {
    expect(normalizeEnvVarName("  OPENAI_API_KEY  ")).toBe("OPENAI_API_KEY");
    expect(normalizeEnvVarName("_private1")).toBe("_private1");
  });

  test("rejects invalid identifiers", () => {
    expect(() => normalizeEnvVarName("1LEADING")).toThrow();
    expect(() => normalizeEnvVarName("has-dash")).toThrow();
    expect(() => normalizeEnvVarName("has space")).toThrow();
  });

  test("rejects reserved names", () => {
    expect(isReservedEnvVarName("PATH")).toBe(true);
    expect(isReservedEnvVarName("STAVE_LOCAL_MCP_TOKEN")).toBe(true);
    expect(() => normalizeEnvVarName("PATH")).toThrow("reserved");
    expect(() => normalizeEnvVarName("CLAUDE_CONFIG_DIR")).toThrow("reserved");
  });
});

describe("Secret IPC schema envVarName", () => {
  test("accepts a valid name or empty string (clear)", () => {
    expect(
      SecretUpsertArgsSchema.safeParse({
        name: "OpenAI",
        value: "sk-secret",
        envVarName: "OPENAI_API_KEY",
      }).success,
    ).toBe(true);
    expect(
      SecretUpsertArgsSchema.safeParse({
        name: "OpenAI",
        envVarName: "",
      }).success,
    ).toBe(true);
  });

  test("rejects a malformed env var name at the schema layer", () => {
    expect(
      SecretUpsertArgsSchema.safeParse({
        name: "OpenAI",
        value: "sk-secret",
        envVarName: "bad-name",
      }).success,
    ).toBe(false);
  });
});

describe("SecretVault envVarName", () => {
  test("persists an env var name and returns it in metadata", async () => {
    const { vault } = createHarness();
    const saved = await vault.upsert({
      name: "OpenAI",
      value: "sk-secret",
      envVarName: "OPENAI_API_KEY",
    });
    expect(saved.envVarName).toBe("OPENAI_API_KEY");
    expect((await vault.list())[0]?.envVarName).toBe("OPENAI_API_KEY");
  });

  test("loads a legacy vault file that lacks envVarName", async () => {
    const { filePath, vault } = createHarness();
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        secrets: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Legacy",
            description: "",
            valuePreview: "••••2345",
            valueCiphertext: "sealed:bGVnYWN5",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );
    const list = await vault.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.envVarName).toBeUndefined();
  });

  test("rejects a duplicate env var name", async () => {
    const { vault } = createHarness();
    await vault.upsert({ name: "One", value: "a", envVarName: "SHARED_KEY" });
    await expect(
      vault.upsert({ name: "Two", value: "b", envVarName: "SHARED_KEY" }),
    ).rejects.toThrow("already uses the environment variable");
  });

  test("rejects a reserved env var name in the vault", async () => {
    const { vault } = createHarness();
    await expect(
      vault.upsert({ name: "Bad", value: "a", envVarName: "PATH" }),
    ).rejects.toThrow("reserved");
  });
});

describe("SecretVault.resolveEnvForIds", () => {
  test("resolves bound ids to an env map and skips uninjectable ids", async () => {
    const { vault } = createHarness();
    const withVar = await vault.upsert({
      name: "OpenAI",
      value: "sk-openai",
      envVarName: "OPENAI_API_KEY",
    });
    const withoutVar = await vault.upsert({
      name: "No env var",
      value: "sk-noenv",
    });

    const result = await vault.resolveEnvForIds([
      withVar.id,
      withoutVar.id,
      withVar.id, // duplicate id → resolved once
      "00000000-0000-4000-8000-999999999999", // not found
    ]);

    expect(result.env).toEqual({ OPENAI_API_KEY: "sk-openai" });
    const reasons = result.skipped.map((entry) => entry.reason).sort();
    expect(reasons).toEqual(["no-env-var-name", "not-found"]);
  });

  test("returns an empty map for no ids without touching encryption", async () => {
    const insecure = createHarness({ insecureBackend: true }).vault;
    // No ids → must not assert encryption (would throw for insecure backend).
    expect(await insecure.resolveEnvForIds([])).toEqual({
      env: {},
      skipped: [],
    });
  });
});

describe("prompt secret references", () => {
  test("parses valid keys and classifies malformed and protected keys", () => {
    const parsed = parsePromptSecretReferences({
      prompt:
        "Use @secret:{OPENAI_API_KEY}, retry @secret:{MISSING_KEY}, refuse @secret:{PATH}, and ignore @secret:{bad-name}. @secret:{OPENAI_API_KEY}",
    });

    expect(parsed.resolutionKeys).toEqual([
      "OPENAI_API_KEY",
      "MISSING_KEY",
    ]);
    expect(parsed.references).toEqual([
      { key: "OPENAI_API_KEY", status: "candidate" },
      { key: "MISSING_KEY", status: "candidate" },
      { key: "PATH", status: "protected" },
      { key: "", status: "invalid" },
    ]);
  });

  test("adds only value-free availability guidance to the provider prompt", () => {
    const secretValue = "must-never-enter-provider-prompt";
    const parsed = parsePromptSecretReferences({
      prompt:
        "Authenticate with @secret:{OPENAI_API_KEY}; also try @secret:{MISSING_KEY} and @secret:{CODEX_HOME}.",
    });
    const providerPrompt = appendPromptSecretReferenceContext({
      prompt:
        "Authenticate with @secret:{OPENAI_API_KEY}; also try @secret:{MISSING_KEY} and @secret:{CODEX_HOME}.",
      parsed,
      availableEnvNames: ["OPENAI_API_KEY"],
    });

    expect(providerPrompt).toContain("$OPENAI_API_KEY");
    expect(providerPrompt).toContain(
      "@secret:{MISSING_KEY} is unavailable",
    );
    expect(providerPrompt).toContain(
      "CODEX_HOME is a protected runtime variable",
    );
    expect(providerPrompt).toContain("Secret values are not included");
    expect(providerPrompt).not.toContain(secretValue);
  });
});

describe("SecretVault.resolveEnvForReferences", () => {
  test("resolves valid keys and skips missing and protected references", async () => {
    const { vault } = createHarness();
    await vault.upsert({
      name: "OpenAI",
      value: "sk-reference-value",
      envVarName: "OPENAI_API_KEY",
    });

    const result = await vault.resolveEnvForReferences([
      "OPENAI_API_KEY",
      "MISSING_KEY",
      "PATH",
    ]);

    expect(result.env).toEqual({ OPENAI_API_KEY: "sk-reference-value" });
    expect(result.skipped).toEqual([
      { key: "MISSING_KEY", reason: "not-found" },
      { key: "PATH", reason: "reserved-name" },
    ]);
  });

  test("rejects malformed reference keys at the vault boundary", async () => {
    const { vault } = createHarness();

    expect(await vault.resolveEnvForReferences(["bad-name"])).toEqual({
      env: {},
      skipped: [{ key: "", reason: "invalid-name" }],
    });
  });
});
