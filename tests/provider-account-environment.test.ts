import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { resolveProviderAccountEnvironment } from "../electron/provider-accounts/environment";
import {
  buildClaudeCliEnv,
  buildCodexCliEnv,
} from "../electron/providers/cli-path-env";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProviderId,
} from "../src/lib/providers/provider-accounts";

const roots: string[] = [];
const restoredEnv = new Map<string, string | undefined>();
function setEnv(key: string, value: string) {
  if (!restoredEnv.has(key)) restoredEnv.set(key, process.env[key]);
  process.env[key] = value;
}
function fixture(providerId: ProviderAccountProviderId) {
  const root = mkdtempSync(path.join(tmpdir(), "stave-account-env-"));
  roots.push(root);
  setEnv("STAVE_USER_DATA_PATH", root);
  const registry = new ProviderAccountRegistry(root);
  const a = registry.create({ providerId, label: "A" });
  const b = registry.create({ providerId, label: "B" });
  return { root, registry, a, b };
}
afterEach(() => {
  for (const [key, value] of restoredEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  restoredEnv.clear();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("native account environments", () => {
  test("System default preserves the native environment and requires no registry", () => {
    const env = {
      CODEX_HOME: "/tmp/system-codex",
      OPENAI_API_KEY: "fixture-system-key",
    };
    for (const profileId of [undefined, SYSTEM_ACCOUNT_PROFILE_ID]) {
      const apply = resolveProviderAccountEnvironment({
        providerId: "codex",
        profileId,
        env,
        resolveDirectory: () => {
          throw new Error("must not resolve");
        },
      });
      expect(apply({ ...env })).toEqual(env);
    }
  });

  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId} isolates the actual child env for two profiles without mutating process.env`, () => {
      const { root, a, b } = fixture(providerId);
      const key = providerId === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
      const authKeys =
        providerId === "codex"
          ? ["OPENAI_API_KEY", "CODEX_API_KEY", "OPENAI_BASE_URL"]
          : [
              "ANTHROPIC_API_KEY",
              "ANTHROPIC_AUTH_TOKEN",
              "CLAUDE_CODE_OAUTH_TOKEN",
              "ANTHROPIC_BASE_URL",
              "CLAUDE_CODE_USE_BEDROCK",
            ];
      const systemDirectory = path.join(root, "system");
      setEnv(key, systemDirectory);
      for (const authKey of authKeys)
        setEnv(authKey, "fixture-inherited-value");
      const build = (accountProfileId?: string) =>
        providerId === "codex"
          ? buildCodexCliEnv({
              executablePath: process.execPath,
              accountProfileId,
              mcpConfigPaths: [],
              resolver: () => null,
            })
          : buildClaudeCliEnv({
              executablePath: process.execPath,
              accountProfileId,
              mcpConfigPaths: [],
              resolver: () => null,
            });
      for (const profile of [a, b]) {
        const env = build(profile.id);
        expect(env[key]).toBe(profile.configDirectory!);
        const selection = providerId === "codex" ? { codexAccountProfileId: profile.id } : { claudeAccountProfileId: profile.id };
        expect(withProviderAccountScope(selection, () => build())[key]).toBe(profile.configDirectory!);
        if (providerId === "claude-code") expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(profile.configDirectory);
        for (const authKey of authKeys) expect(env[authKey]).toBeUndefined();
        const child = spawnSync(
          process.execPath,
          [
            "-e",
            `process.stdout.write(JSON.stringify([process.env[${JSON.stringify(key)}], ${JSON.stringify(authKeys)}.filter(k => process.env[k] !== undefined)]))`,
          ],
          {
            env: Object.fromEntries(
              Object.entries(env).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            ),
            encoding: "utf8",
          },
        );
        expect(child.status).toBe(0);
        expect(JSON.parse(child.stdout)).toEqual([profile.configDirectory, []]);
      }
      expect(build()[key]).toBe(systemDirectory);
      for (const authKey of authKeys)
        expect(process.env[authKey]).toBe("fixture-inherited-value");
      expect(process.env[key]).toBe(systemDirectory);
    });

    test(`${providerId} discovers MCP env references from the selected directory`, () => {
      const { a, b } = fixture(providerId);
      for (const [profile, name] of [
        [a, "PROFILE_A_MCP"],
        [b, "PROFILE_B_MCP"],
      ] as const) {
        if (providerId === "codex")
          writeFileSync(
            path.join(profile.configDirectory!, "config.toml"),
            `[mcp_servers.remote]\nbearer_token_env_var = "${name}"\n`,
          );
        else
          writeFileSync(
            path.join(profile.configDirectory!, ".claude.json"),
            JSON.stringify({
              mcpServers: {
                remote: {
                  type: "http",
                  url: "https://example.invalid/mcp",
                  headers: { Authorization: `Bearer \${${name}}` },
                },
              },
            }),
          );
      }
      for (const [profile, expectedName, otherName] of [
        [a, "PROFILE_A_MCP", "PROFILE_B_MCP"],
        [b, "PROFILE_B_MCP", "PROFILE_A_MCP"],
      ] as const) {
        const resolved: string[] = [];
        const resolver = ({ key }: { key: string }) => {
          resolved.push(key);
          return key === expectedName ? "fixture-mcp-value" : null;
        };
        const env =
          providerId === "codex"
            ? buildCodexCliEnv({
                executablePath: process.execPath,
                accountProfileId: profile.id,
                resolver,
              })
            : buildClaudeCliEnv({
                executablePath: process.execPath,
                accountProfileId: profile.id,
                resolver,
              });
        expect(resolved).toContain(expectedName);
        expect(resolved).not.toContain(otherName);
        expect(env[expectedName]).toBe("fixture-mcp-value");
      }
    });
  }

  test("reapplying the profile prevents config hydration from replacing its identity", () => {
    const { a, registry } = fixture("claude-code");
    const env = {
      CLAUDE_CONFIG_DIR: "/tmp/system-claude",
      ANTHROPIC_API_KEY: "fixture",
    };
    const apply = resolveProviderAccountEnvironment({
      providerId: "claude-code",
      profileId: a.id,
      env,
      resolveDirectory: (selection) => registry.resolveDirectory(selection),
    });
    apply(env);
    env.CLAUDE_CONFIG_DIR = "/tmp/other-account";
    env.ANTHROPIC_API_KEY = "fixture-hydrated";
    apply(env);
    expect(env.CLAUDE_CONFIG_DIR).toBe(a.configDirectory!);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("unknown, removed, and wrong-provider selections never fall back to System default", () => {
    const { a, registry } = fixture("codex");
    expect(() =>
      buildClaudeCliEnv({
        executablePath: process.execPath,
        accountProfileId: a.id,
        resolver: () => null,
      }),
    ).toThrow("no longer exists");
    registry.remove({ providerId: "codex", id: a.id });
    expect(() =>
      buildCodexCliEnv({ accountProfileId: a.id, resolver: () => null }),
    ).toThrow("no longer exists");
    expect(() =>
      buildCodexCliEnv({ accountProfileId: "", resolver: () => null }),
    ).toThrow("no longer exists");
  });

  test("rejects a profile when System default later changes to its directory", () => {
    const { root, registry } = fixture("codex");
    const directory = path.join(root, "system");
    mkdirSync(directory);
    const profile = registry.create({
      providerId: "codex",
      label: "Alias",
      configDirectory: directory,
    });
    setEnv("CODEX_HOME", directory);
    expect(() =>
      buildCodexCliEnv({ accountProfileId: profile.id, resolver: () => null }),
    ).toThrow("belongs to System default");
  });
});
