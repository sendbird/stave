import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  resolveClaudeMcpServers,
  resolveSharedOnlyClaudeMcpServersSync,
} from "../electron/providers/claude-mcp-config";
import {
  resolveSharedClaudeMcpStateFile,
  SETUP_SHARING_LEDGER_NAME,
} from "../electron/provider-accounts/shared-mcp";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function layout() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-shared-mcp-"));
  roots.push(root);
  const systemDir = path.join(root, "system");
  const accountDir = path.join(root, "account");
  const cwd = path.join(root, "workspace");
  for (const directory of [systemDir, accountDir, cwd]) mkdirSync(directory, { recursive: true });
  return { root, systemDir, accountDir, cwd };
}

function writeJson(target: string, value: unknown) {
  writeFileSync(target, JSON.stringify(value));
}

function shareSetup(accountDir: string) {
  writeJson(path.join(accountDir, SETUP_SHARING_LEDGER_NAME), {
    version: 1,
    sharedFrom: "/elsewhere",
    links: {},
    copies: {},
  });
}

const staveServers = {
  "stave-local-mcp": { type: "http" as const, url: "http://127.0.0.1:43123/mcp" },
};

describe("System default MCP servers for a managed Claude account", () => {
  test("only an account that shares System default's setup reads its .claude.json", () => {
    const { systemDir, accountDir } = layout();
    const resolve = () =>
      resolveSharedClaudeMcpStateFile({ claudeConfigDir: accountDir, systemConfigDir: () => systemDir });
    expect(resolve()).toBeNull();
    shareSetup(accountDir);
    expect(resolve()).toBe(path.join(systemDir, ".claude.json"));
  });

  test("System default itself and a relative folder never read a second copy", () => {
    const { systemDir, accountDir } = layout();
    shareSetup(accountDir);
    shareSetup(systemDir);
    expect(resolveSharedClaudeMcpStateFile({ claudeConfigDir: systemDir, systemConfigDir: () => systemDir })).toBeNull();
    expect(resolveSharedClaudeMcpStateFile({ claudeConfigDir: "account", systemConfigDir: () => systemDir })).toBeNull();
    expect(resolveSharedClaudeMcpStateFile({ claudeConfigDir: undefined, systemConfigDir: () => systemDir })).toBeNull();
  });

  test("shared servers sit below the account's own servers at each scope", async () => {
    const { systemDir, accountDir, cwd } = layout();
    writeJson(path.join(systemDir, ".claude.json"), {
      oauthAccount: { emailAddress: "system@example.test" },
      mcpServers: {
        crane: { type: "http", url: "https://crane.example.test/mcp", headers: { Authorization: "Bearer ${CRANE_TOKEN}" } },
        ibis: { type: "http", url: "https://ibis.example.test/mcp" },
        "stave-local-mcp": { type: "http", url: "http://127.0.0.1:1/stale" },
      },
      projects: {
        [cwd]: { mcpServers: { portal: { command: "portal-mcp" }, ibis: { command: "ibis-local" } } },
      },
    });
    writeJson(path.join(accountDir, ".claude.json"), {
      mcpServers: { ibis: { type: "http", url: "https://ibis.account.test/mcp" } },
    });

    const servers = await resolveClaudeMcpServers({
      cwd,
      claudeConfigDir: accountDir,
      sharedStateFilePath: path.join(systemDir, ".claude.json"),
      staveServers,
    });
    expect(servers).toEqual({
      crane: { type: "http", url: "https://crane.example.test/mcp", headers: { Authorization: "Bearer ${CRANE_TOKEN}" } },
      // Shared local scope outranks user scope, as native Claude does.
      ibis: { type: "stdio", command: "ibis-local" },
      portal: { type: "stdio", command: "portal-mcp" },
      "stave-local-mcp": staveServers["stave-local-mcp"],
    });
  });

  test("the account's own local server outranks a shared local one", async () => {
    const { systemDir, accountDir, cwd } = layout();
    writeJson(path.join(systemDir, ".claude.json"), {
      projects: { [cwd]: { mcpServers: { portal: { command: "system-portal" } } } },
    });
    writeJson(path.join(accountDir, ".claude.json"), {
      projects: { [cwd]: { mcpServers: { portal: { command: "account-portal" } } } },
    });
    const servers = await resolveClaudeMcpServers({
      cwd,
      claudeConfigDir: accountDir,
      sharedStateFilePath: path.join(systemDir, ".claude.json"),
      staveServers,
    });
    expect(servers?.portal).toEqual({ type: "stdio", command: "account-portal" });
  });

  test("shared servers still reach the session when Stave's own server is off", async () => {
    const { systemDir, accountDir, cwd } = layout();
    writeJson(path.join(systemDir, ".claude.json"), {
      mcpServers: { crane: { type: "http", url: "https://crane.example.test/mcp" } },
    });
    const shared = path.join(systemDir, ".claude.json");
    expect(await resolveClaudeMcpServers({ cwd, claudeConfigDir: accountDir, sharedStateFilePath: shared })).toEqual({
      crane: { type: "http", url: "https://crane.example.test/mcp" },
    });
    // Nothing shared and no Stave server: the CLI reads its own files.
    writeJson(shared, {});
    expect(await resolveClaudeMcpServers({ cwd, claudeConfigDir: accountDir, sharedStateFilePath: shared })).toBeUndefined();
    expect(await resolveClaudeMcpServers({ cwd, claudeConfigDir: accountDir })).toBeUndefined();
  });

  test("strict MCP config keeps only Stave's server", async () => {
    const { systemDir, accountDir, cwd } = layout();
    writeJson(path.join(systemDir, ".claude.json"), {
      mcpServers: { crane: { type: "http", url: "https://crane.example.test/mcp" } },
    });
    expect(
      await resolveClaudeMcpServers({
        cwd,
        claudeConfigDir: accountDir,
        sharedStateFilePath: path.join(systemDir, ".claude.json"),
        staveServers,
        strict: true,
      }),
    ).toEqual(staveServers);
  });

  test("a CLI tab gets only the servers the account does not define itself", () => {
    const { systemDir, accountDir, cwd } = layout();
    writeJson(path.join(systemDir, ".claude.json"), {
      mcpServers: {
        crane: { type: "http", url: "https://crane.example.test/mcp" },
        ibis: { type: "http", url: "https://ibis.example.test/mcp" },
        "stave-local-mcp": { type: "http", url: "http://127.0.0.1:1/stale" },
      },
    });
    writeJson(path.join(accountDir, ".claude.json"), {
      mcpServers: { ibis: { type: "http", url: "https://ibis.account.test/mcp" } },
    });
    writeJson(path.join(cwd, ".mcp.json"), { mcpServers: { crane: { command: "project-crane" } } });
    expect(
      resolveSharedOnlyClaudeMcpServersSync({
        cwd,
        claudeConfigDir: accountDir,
        sharedStateFilePath: path.join(systemDir, ".claude.json"),
      }),
    ).toEqual({});

    rmSync(path.join(cwd, ".mcp.json"));
    expect(
      resolveSharedOnlyClaudeMcpServersSync({
        cwd,
        claudeConfigDir: accountDir,
        sharedStateFilePath: path.join(systemDir, ".claude.json"),
      }),
    ).toEqual({ crane: { type: "http", url: "https://crane.example.test/mcp" } });
    expect(resolveSharedOnlyClaudeMcpServersSync({ cwd, claudeConfigDir: accountDir, sharedStateFilePath: null })).toEqual({});
  });
});
