import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LensCredentialVault } from "../electron/main/browser/lens-credential-vault";
import {
  LensCredentialCreateArgsSchema,
  LensCredentialDeleteArgsSchema,
  LensCredentialUpdateArgsSchema,
  LensCredentialUpsertArgsSchema,
} from "../electron/main/ipc/schemas";
import {
  normalizeLensCredentialHost,
  normalizeLensCredentialHosts,
} from "../src/lib/lens/lens-credentials";

const tempDirs: string[] = [];

function sealSecret(username: string, password: string): string {
  return Buffer.from(
    `sealed:${Buffer.from(JSON.stringify({ username, password })).toString("base64")}`,
  ).toString("base64");
}

function createHarness(options?: {
  encryptionAvailable?: boolean;
  insecureBackend?: boolean;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-lens-credentials-"));
  tempDirs.push(directory);
  const filePath = path.join(directory, "lens-credentials.v1.json");
  let timestamp = 0;
  let id = 0;
  const vault = new LensCredentialVault({
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

describe("normalizeLensCredentialHost", () => {
  test("normalizes URLs and bare exact hosts", () => {
    expect(normalizeLensCredentialHost(" Example.COM. ")).toBe("example.com");
    expect(
      normalizeLensCredentialHost(
        "https://Dashboard-Dev.Sendbird.com/auth/signin",
      ),
    ).toBe("dashboard-dev.sendbird.com");
  });

  test("rejects wildcard and non-http targets", () => {
    expect(normalizeLensCredentialHost("*.example.com")).toBeNull();
    expect(normalizeLensCredentialHost("javascript:alert(1)")).toBeNull();
    expect(normalizeLensCredentialHost("not a host")).toBeNull();
  });
});

describe("normalizeLensCredentialHosts", () => {
  test("normalizes, deduplicates, and skips blank entries", () => {
    expect(
      normalizeLensCredentialHosts([
        " Example.COM. ",
        "https://example.com/login",
        "",
        "dashboard-dev.sendbird.com",
      ]),
    ).toEqual(["example.com", "dashboard-dev.sendbird.com"]);
  });

  test("fails closed when any entry is invalid or none remain", () => {
    expect(
      normalizeLensCredentialHosts(["example.com", "*.example.com"]),
    ).toBeNull();
    expect(normalizeLensCredentialHosts([])).toBeNull();
    expect(normalizeLensCredentialHosts(["", "  "])).toBeNull();
  });
});

describe("Lens credential IPC schemas", () => {
  test("accepts bounded create and update payloads", () => {
    expect(
      LensCredentialUpsertArgsSchema.safeParse({
        hosts: ["example.com", "example.org"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }).success,
    ).toBe(true);
    expect(
      LensCredentialUpsertArgsSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        hosts: ["example.com"],
        username: "person@example.com",
        autoFill: false,
      }).success,
    ).toBe(true);
  });

  test("rejects empty host lists, malformed ids, and unknown fields", () => {
    expect(
      LensCredentialUpsertArgsSchema.safeParse({
        hosts: [],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }).success,
    ).toBe(false);
    expect(
      LensCredentialDeleteArgsSchema.safeParse({ id: "not-an-id" }).success,
    ).toBe(false);
    expect(
      LensCredentialUpsertArgsSchema.safeParse({
        hosts: ["example.com"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
        returnedPassword: true,
      }).success,
    ).toBe(false);
  });

  test("keeps Local MCP create and update requirements explicit", () => {
    expect(
      LensCredentialCreateArgsSchema.safeParse({
        hosts: ["example.com"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }).success,
    ).toBe(true);
    expect(
      LensCredentialCreateArgsSchema.safeParse({
        hosts: ["example.com"],
        username: "person@example.com",
        autoFill: true,
      }).success,
    ).toBe(false);
    expect(
      LensCredentialUpdateArgsSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        hosts: ["example.com"],
        username: "person@example.com",
        autoFill: false,
      }).success,
    ).toBe(true);
  });
});

describe("LensCredentialVault", () => {
  test("stores only ciphertext and returns metadata without a password", async () => {
    const { filePath, vault } = createHarness();
    const saved = await vault.upsert({
      hosts: ["https://Example.com/login"],
      username: "person@example.com",
      password: "plain-secret-value",
      autoFill: true,
    });

    expect(saved.hosts).toEqual(["example.com"]);
    expect(saved).not.toHaveProperty("password");
    expect(await vault.list()).toEqual([saved]);
    const persisted = readFileSync(filePath, "utf8");
    expect(persisted).not.toContain("person@example.com");
    expect(persisted).not.toContain("plain-secret-value");
    expect(persisted).toContain("secretCiphertext");
  });

  test("decrypts only an exact matching hostname", async () => {
    const { vault } = createHarness();
    await vault.upsert({
      hosts: ["example.com"],
      username: "person@example.com",
      password: "secret",
      autoFill: true,
    });

    expect(await vault.findForUrl("https://example.com/sign-in")).toMatchObject({
      hosts: ["example.com"],
      matchedHost: "example.com",
      username: "person@example.com",
      password: "secret",
    });
    expect(await vault.findForUrl("https://app.example.com/sign-in")).toBeNull();
  });

  test("matches one account on every hostname it covers", async () => {
    const { vault } = createHarness();
    const saved = await vault.upsert({
      hosts: [
        "dashboard-dev.sendbird.com",
        "https://dashboard-staging.sendbird.com/auth",
      ],
      username: "person@example.com",
      password: "secret",
      autoFill: true,
    });

    expect(saved.hosts).toEqual([
      "dashboard-dev.sendbird.com",
      "dashboard-staging.sendbird.com",
    ]);
    expect(
      await vault.findForUrl("https://dashboard-dev.sendbird.com/login"),
    ).toMatchObject({
      matchedHost: "dashboard-dev.sendbird.com",
      password: "secret",
    });
    expect(
      await vault.findForUrl("https://dashboard-staging.sendbird.com/login"),
    ).toMatchObject({
      matchedHost: "dashboard-staging.sendbird.com",
      password: "secret",
    });
    expect(
      await vault.findForUrl("https://dashboard.sendbird.com/login"),
    ).toBeNull();
  });

  test("rejects an account when any hostname is invalid", async () => {
    const { vault } = createHarness();
    await expect(
      vault.upsert({
        hosts: ["example.com", "*.example.com"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }),
    ).rejects.toThrow("at least one valid http(s) hostname");
  });

  test("preserves the encrypted password during metadata-only edits", async () => {
    const { filePath, vault } = createHarness();
    const saved = await vault.upsert({
      hosts: ["example.com"],
      username: "before@example.com",
      password: "keep-this-secret",
      autoFill: true,
    });
    await vault.upsert({
      id: saved.id,
      hosts: ["example.com", "example.org"],
      username: "after@example.com",
      autoFill: false,
    });
    const persisted = readFileSync(filePath, "utf8");
    expect(persisted).not.toContain("after@example.com");
    expect(persisted).not.toContain("keep-this-secret");
    expect(await vault.findForUrl("https://example.org")).toMatchObject({
      username: "after@example.com",
      password: "keep-this-secret",
      autoFill: false,
    });
    expect(
      await vault.findForUrl("https://example.com", { autoFillOnly: true }),
    ).toBeNull();
  });

  test("stores multiple accounts for one exact hostname", async () => {
    const { vault } = createHarness();
    const first = await vault.upsert({
      hosts: ["example.com"],
      username: "first@example.com",
      password: "first-secret",
      autoFill: true,
    });
    const second = await vault.upsert({
      hosts: ["https://example.com/other"],
      username: "second@example.com",
      password: "second-secret",
      autoFill: false,
    });

    expect(await vault.list()).toEqual([first, second]);
    expect(await vault.findForUrl("https://example.com/login")).toMatchObject({
      username: "first@example.com",
      password: "first-secret",
    });
    expect(
      await vault.findForUrl("https://example.com/login", {
        username: "second@example.com",
      }),
    ).toMatchObject({
      username: "second@example.com",
      password: "second-secret",
    });
  });

  test("keeps at most one automatic-fill account per hostname", async () => {
    const { vault } = createHarness();
    const first = await vault.upsert({
      hosts: ["example.com"],
      username: "first@example.com",
      password: "first-secret",
      autoFill: true,
    });
    const second = await vault.upsert({
      hosts: ["example.com"],
      username: "second@example.com",
      password: "second-secret",
      autoFill: true,
    });

    expect(await vault.list()).toMatchObject([
      { id: first.id, autoFill: false },
      { id: second.id, autoFill: true },
    ]);
    expect(
      await vault.findForUrl("https://example.com/login", {
        autoFillOnly: true,
      }),
    ).toMatchObject({ id: second.id, username: "second@example.com" });
  });

  test("clears automatic fill from accounts sharing any hostname", async () => {
    const { vault } = createHarness();
    const first = await vault.upsert({
      hosts: ["example.com", "example.org"],
      username: "first@example.com",
      password: "first-secret",
      autoFill: true,
    });
    const second = await vault.upsert({
      hosts: ["example.org", "example.net"],
      username: "second@example.com",
      password: "second-secret",
      autoFill: true,
    });
    const third = await vault.upsert({
      hosts: ["unrelated.example.dev"],
      username: "third@example.com",
      password: "third-secret",
      autoFill: true,
    });

    expect(await vault.list()).toMatchObject([
      { id: first.id, autoFill: false },
      { id: second.id, autoFill: true },
      { id: third.id, autoFill: true },
    ]);
  });

  test("requires a username when multiple on-demand accounts are ambiguous", async () => {
    const { vault } = createHarness();
    await vault.upsert({
      hosts: ["example.com"],
      username: "first@example.com",
      password: "first-secret",
      autoFill: false,
    });
    await vault.upsert({
      hosts: ["example.com"],
      username: "second@example.com",
      password: "second-secret",
      autoFill: false,
    });

    expect(await vault.findForUrl("https://example.com/login")).toBeNull();
    expect(
      await vault.findForUrl("https://example.com/login", {
        username: "second@example.com",
      }),
    ).toMatchObject({ username: "second@example.com" });
  });

  test("deletes the encrypted entry", async () => {
    const { vault } = createHarness();
    const saved = await vault.upsert({
      hosts: ["example.com"],
      username: "person@example.com",
      password: "secret",
      autoFill: true,
    });

    expect(await vault.delete(saved.id)).toBe(true);
    expect(await vault.delete(saved.id)).toBe(false);
    expect(await vault.list()).toEqual([]);
  });

  test("migrates a version 1 single-host vault on read and persists v2 on write", async () => {
    const { filePath, vault } = createHarness();
    writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        credentials: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            host: "example.com",
            secretCiphertext: sealSecret("person@example.com", "legacy-secret"),
            autoFill: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );

    expect(await vault.list()).toMatchObject([
      {
        id: "11111111-1111-4111-8111-111111111111",
        hosts: ["example.com"],
        username: "person@example.com",
        autoFill: true,
      },
    ]);
    expect(await vault.findForUrl("https://example.com/login")).toMatchObject({
      matchedHost: "example.com",
      password: "legacy-secret",
    });

    await vault.upsert({
      id: "11111111-1111-4111-8111-111111111111",
      hosts: ["example.com", "example.org"],
      username: "person@example.com",
      autoFill: true,
    });
    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as {
      version: number;
      credentials: Array<Record<string, unknown>>;
    };
    expect(persisted.version).toBe(2);
    expect(persisted.credentials[0].hosts).toEqual([
      "example.com",
      "example.org",
    ]);
    expect(persisted.credentials[0]).not.toHaveProperty("host");
  });

  test("refuses unavailable or insecure encryption backends", async () => {
    const unavailable = createHarness({ encryptionAvailable: false }).vault;
    await expect(
      unavailable.upsert({
        hosts: ["example.com"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }),
    ).rejects.toThrow("encryption is unavailable");

    const insecure = createHarness({ insecureBackend: true }).vault;
    await expect(
      insecure.upsert({
        hosts: ["example.com"],
        username: "person@example.com",
        password: "secret",
        autoFill: true,
      }),
    ).rejects.toThrow("basic_text");
  });

  test("fails closed when the vault document is malformed", async () => {
    const { filePath, vault } = createHarness();
    writeFileSync(filePath, "{not-json", "utf8");
    await expect(vault.list()).rejects.toThrow("not valid JSON");
  });
});
