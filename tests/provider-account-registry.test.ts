import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../src/lib/providers/provider-accounts";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-account-registry-"));
  roots.push(root);
  return { root, registry: new ProviderAccountRegistry(root) };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("provider account registry", () => {
  test("keeps System default available without creating storage or reading native auth", () => {
    const { root, registry } = fixture();
    expect(registry.list()).toEqual(
      ["claude-code", "codex"].map((providerId) => ({
        id: SYSTEM_ACCOUNT_PROFILE_ID,
        providerId,
        label: "System default",
        kind: "system",
      })),
    );
    expect(registry.resolveDirectory({ providerId: "codex" })).toBeNull();
    expect(
      registry.resolveDirectory({
        providerId: "claude-code",
        profileId: SYSTEM_ACCOUNT_PROFILE_ID,
      }),
    ).toBeNull();
    expect(readdirSync(root)).toEqual([]);
  });

  test("persists distinct opaque profiles even when labels are identical", () => {
    const { root, registry } = fixture();
    const a = registry.create({ providerId: "codex", label: " Account " });
    const b = registry.create({ providerId: "codex", label: "Account" });
    expect(a.id).not.toBe(b.id);
    expect(a.configDirectory).not.toBe(b.configDirectory);
    expect(a.label).toBe("Account");
    const reader = new ProviderAccountRegistry(root);
    expect(reader.list().slice(2)).toEqual([a, b]);
    expect(
      reader.resolveDirectory({ providerId: "codex", profileId: a.id }),
    ).toBe(a.configDirectory!);
    expect(
      reader.resolveDirectory({ providerId: "codex", profileId: b.id }),
    ).toBe(b.configDirectory!);
    expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
    if (process.platform !== "win32") {
      expect(statSync(registry.filePath).mode & 0o777).toBe(0o600);
      expect(statSync(a.configDirectory!).mode & 0o777).toBe(0o700);
    }
  });

  test("registers existing directories in place and rejects aliases across providers", () => {
    const { root, registry } = fixture();
    const directory = path.join(root, "existing");
    mkdirSync(directory);
    writeFileSync(path.join(directory, "native-auth-fixture"), "native-owned");
    const alias = path.join(root, "alias");
    symlinkSync(directory, alias, "dir");
    const profile = registry.create({
      providerId: "claude-code",
      label: "Existing",
      configDirectory: alias,
    });
    expect(profile.configDirectory).toBe(realpathSync(directory));
    expect(profile.kind).toBe("external");
    expect(() =>
      registry.create({
        providerId: "codex",
        label: "Duplicate",
        configDirectory: directory,
      }),
    ).toThrow("already registered");
    expect(readdirSync(directory)).toEqual(["native-auth-fixture"]);
  });

  test("rejects relative, missing, and file paths without registering an account", () => {
    const { root, registry } = fixture();
    const file = path.join(root, "file");
    writeFileSync(file, "fixture");
    for (const configDirectory of [
      "relative",
      path.join(root, "missing"),
      file,
    ]) {
      expect(() =>
        registry.create({
          providerId: "codex",
          label: "Invalid",
          configDirectory,
        }),
      ).toThrow();
    }
    expect(registry.list()).toHaveLength(2);
  });

  test("does not register a second identity for System default, including symlink aliases", () => {
    const { root } = fixture();
    const directory = path.join(root, "system");
    mkdirSync(directory);
    const alias = path.join(root, "system-alias");
    symlinkSync(directory, alias, "dir");
    const registry = new ProviderAccountRegistry(root, () => directory);
    for (const providerId of ["claude-code", "codex"] as const) {
      expect(() =>
        registry.create({ providerId, label: "Alias", configDirectory: alias }),
      ).toThrow("belongs to System default");
    }
    expect(registry.list()).toHaveLength(2);
  });

  test("renaming retains the same identity and directory; a host reader sees removals", () => {
    const { root, registry } = fixture();
    const profile = registry.create({
      providerId: "claude-code",
      label: "Before",
    });
    const reader = new ProviderAccountRegistry(root);
    const renamed = registry.rename({
      providerId: "claude-code",
      id: profile.id,
      label: "After",
    });
    expect(renamed).toEqual({ ...profile, label: "After" });
    expect(reader.list().at(-1)?.label).toBe("After");
    writeFileSync(
      path.join(profile.configDirectory!, "native-session-fixture"),
      "keep",
    );
    registry.remove({ providerId: "claude-code", id: profile.id });
    expect(() =>
      reader.resolveDirectory({
        providerId: "claude-code",
        profileId: profile.id,
      }),
    ).toThrow("no longer exists");
    expect(
      readFileSync(
        path.join(profile.configDirectory!, "native-session-fixture"),
        "utf8",
      ),
    ).toBe("keep");
    expect(reader.list()).toHaveLength(2);
  });

  test("cannot mutate System default or use an id with another provider", () => {
    const { registry } = fixture();
    const profile = registry.create({ providerId: "codex", label: "Personal" });
    expect(() =>
      registry.remove({ providerId: "codex", id: SYSTEM_ACCOUNT_PROFILE_ID }),
    ).toThrow("Invalid");
    expect(() =>
      registry.rename({
        providerId: "claude-code",
        id: profile.id,
        label: "Wrong",
      }),
    ).toThrow("no longer exists");
    for (const profileId of [profile.id, "", "unknown"]) {
      expect(() =>
        registry.resolveDirectory({ providerId: "claude-code", profileId }),
      ).toThrow("no longer exists");
    }
    expect(registry.list().at(-1)).toEqual(profile);
  });

  test("rejects credential fields and keeps corrupt storage intact instead of resetting it", () => {
    const { registry } = fixture();
    expect(() =>
      registry.create({
        providerId: "codex",
        label: "Invalid",
        apiKey: "fixture-secret",
      } as never),
    ).toThrow("Invalid");
    writeFileSync(
      registry.filePath,
      '{"version":1,"profiles":"fixture-secret"}',
    );
    expect(() => registry.list()).toThrow("storage is invalid");
    expect(() =>
      registry.create({ providerId: "codex", label: "New" }),
    ).toThrow("storage is invalid");
    expect(readFileSync(registry.filePath, "utf8")).toBe(
      '{"version":1,"profiles":"fixture-secret"}',
    );
    expect(
      registry.resolveDirectory({
        providerId: "codex",
        profileId: SYSTEM_ACCOUNT_PROFILE_ID,
      }),
    ).toBeNull();
  });

  test("fails closed when a registered directory is replaced by a symlink", () => {
    const { root, registry } = fixture();
    const profile = registry.create({ providerId: "codex", label: "Account" });
    const moved = path.join(root, "moved");
    renameSync(profile.configDirectory!, moved);
    symlinkSync(moved, profile.configDirectory!, "dir");
    expect(() =>
      registry.resolveDirectory({ providerId: "codex", profileId: profile.id }),
    ).toThrow("directory changed");
  });
});
