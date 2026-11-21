import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IdentityProbeDeps } from "../electron/provider-accounts/identity";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import {
  PROVIDER_ACCOUNT_IDENTITY_IPC,
  describeProviderAccountIdentity,
} from "../src/lib/providers/provider-account-identity";
import { PROVIDER_ACCOUNT_SETUP_IPC } from "../src/lib/providers/provider-account-setup";
import { DEFAULT_CODEX_MCP_DELEGATION_SETTINGS, type CodexMcpDelegationSettings } from "../src/lib/providers/codex-mcp-delegation-settings";
import { recordClaudeAccountMcpStatus } from "../electron/provider-accounts/mcp-status-cache";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "../src/lib/providers/provider-accounts";

type Handler = (_event: unknown, args?: unknown) => unknown;
const handlers = new Map<string, Handler>();
mock.module("electron", () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  ipcRenderer: {
    invoke: async (channel: string, args?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error("Missing IPC handler");
      return JSON.parse(JSON.stringify(await handler({}, args)));
    },
  },
}));
const { registerProviderAccountIdentityHandlers } = await import("../electron/main/ipc/provider-account-identity");
const { registerCodexMcpDelegationSettings } = await import("../electron/main/ipc/codex-mcp-delegation-settings");
const { registerProviderAccountSetupHandlers } = await import("../electron/main/ipc/provider-account-setup");
const { providerAccountsApi } = await import("../electron/provider-accounts/preload");

// Fabricated values only. The probe is faked, so no CLI runs and no real credential file is read.
function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
const EMPTY_DELEGABLE = [{ id: SYSTEM_ACCOUNT_PROFILE_ID, label: "System default", servers: [], observedAt: null }];
const AUTH_FILE = JSON.stringify({
  OPENAI_API_KEY: "sk-SENTINEL-API-KEY",
  tokens: {
    id_token: `${base64url({ alg: "none" })}.${base64url({
      email: "dev@example.com",
      "https://api.openai.com/auth": { chatgpt_plan_type: "plus" },
    })}.sig`,
    access_token: "SENTINEL-ACCESS-TOKEN",
    refresh_token: "SENTINEL-REFRESH-TOKEN",
  },
});

let root: string;
let registry: ProviderAccountRegistry;
let previousUserDataPath: string | undefined;
let probes: Array<{ commandArgs: readonly string[]; config: string | undefined }>;
let deps: IdentityProbeDeps;
let connectionsProbe: string[];
let systemDirs: Record<"claude-code" | "codex", string>;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-identity-ipc-")));
  previousUserDataPath = process.env.STAVE_USER_DATA_PATH;
  process.env.STAVE_USER_DATA_PATH = path.join(root, "app-data");
  registry = new ProviderAccountRegistry(path.join(root, "app-data"));
  systemDirs = { "claude-code": path.join(root, "system-claude"), codex: path.join(root, "system-codex") };
  for (const dir of Object.values(systemDirs)) mkdirSync(dir);
  probes = [];
  deps = {
    resolveExecutable: ({ providerId }) => `/fake/${providerId}`,
    buildEnv: ({ providerId, profileId }) => {
      const dir = profileId === SYSTEM_ACCOUNT_PROFILE_ID ? systemDirs[providerId] : registry.resolveDirectory({ providerId, profileId })!;
      return providerId === "codex" ? { CODEX_HOME: dir } : { CLAUDE_CONFIG_DIR: dir };
    },
    run: async ({ commandArgs, env }) => {
      probes.push({ commandArgs, config: env.CLAUDE_CONFIG_DIR ?? env.CODEX_HOME });
      return commandArgs[0] === "auth"
        ? { status: 0, stdout: JSON.stringify({ loggedIn: true, email: "claude@example.com", subscriptionType: "max", configDirectory: root }), text: "", timedOut: false }
        : { status: 0, stdout: "", text: "Logged in using ChatGPT", timedOut: false };
    },
    readTextFile: async (filePath) => readFileSync(filePath, "utf8"),
    homeDirectory: () => root,
  };
  handlers.clear();
  registerProviderAccountIdentityHandlers(deps);
  let codexSettings: CodexMcpDelegationSettings = DEFAULT_CODEX_MCP_DELEGATION_SETTINGS;
  registerCodexMcpDelegationSettings({
    read: async () => codexSettings,
    save: async (settings) => { codexSettings = settings; },
    names: async () => ["Slack"],
  });
  connectionsProbe = [];
  registerProviderAccountSetupHandlers((providerId) => systemDirs[providerId], async (profileId) => {
    connectionsProbe.push(profileId);
    return { ok: true, detail: "SENTINEL", checkedAt: Date.now(), servers: [
      { name: "Reports", status: "connected" },
      { name: "Slack", status: "needs-auth", error: "SENTINEL" },
      { name: "Files", status: "failed", error: "SENTINEL" },
      { name: "stave-local-mcp", status: "connected" },
    ] };
  });
});
afterEach(() => {
  if (previousUserDataPath === undefined) delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = previousUserDataPath;
  rmSync(root, { recursive: true, force: true });
});

describe("provider account identity bridge", () => {
  test("uses one global Codex preference and previews normalized server differences", async () => {
    const claude = registry.create({ providerId: "claude-code", label: "Work" });
    const codex = registry.create({ providerId: "codex", label: "Personal" });
    recordClaudeAccountMcpStatus(claude.id, [
      { name: "claude.ai Slack", status: "connected" },
      { name: "Reports", status: "connected" },
    ]);
    const preview = (codexAccountProfileId: string) => providerAccountsApi.codexMcpDelegation({ codexAccountProfileId });
    expect(await preview(SYSTEM_ACCOUNT_PROFILE_ID)).toMatchObject({ ok: true, settings: DEFAULT_CODEX_MCP_DELEGATION_SETTINGS });
    const settings = { enabled: true, claudeAccountProfileId: claude.id };
    expect(await providerAccountsApi.setCodexMcpDelegation(settings)).toBe(true);
    expect(await preview(codex.id)).toEqual({ ok: true, settings, servers: ["Reports"] });
    expect(await preview(SYSTEM_ACCOUNT_PROFILE_ID)).toEqual({ ok: true, settings, servers: ["Reports"] });
    expect(await providerAccountsApi.setCodexMcpDelegation({ ...settings, claudeAccountProfileId: codex.id })).toBe(false);
  });

  test("checks the selected Claude account and returns statuses without diagnostics", async () => {
    const expected = [
      { name: "Reports", status: "connected" },
      { name: "Slack", status: "needs-auth" },
      { name: "Files", status: "failed" },
    ];
    expect(await providerAccountsApi.checkMcpConnections({ profileId: SYSTEM_ACCOUNT_PROFILE_ID })).toEqual({ ok: true, servers: expected });
    const managed = registry.create({ providerId: "claude-code", label: "Personal" });
    expect(await providerAccountsApi.checkMcpConnections({ profileId: managed.id })).toEqual({ ok: true, servers: expected });
    const codex = registry.create({ providerId: "codex", label: "Separate" });
    expect(await providerAccountsApi.checkMcpConnections({ profileId: codex.id })).toEqual({ ok: false });
    expect(await providerAccountsApi.checkMcpConnections({ profileId: "../invalid" })).toEqual({ ok: false });
    expect(connectionsProbe).toEqual([SYSTEM_ACCOUNT_PROFILE_ID, managed.id]);
  });

  test("registers the new channels and exposes them on the existing providerAccounts bridge", () => {
    expect([...handlers.keys()].sort()).toEqual(
      [...Object.values(PROVIDER_ACCOUNT_IDENTITY_IPC), ...Object.values(PROVIDER_ACCOUNT_SETUP_IPC)].sort(),
    );
    for (const method of ["list", "create", "rename", "remove", "login", "checkGateway", "identity", "setupStatus", "shareSetup", "mcpOptions"])
      expect(typeof (providerAccountsApi as unknown as Record<string, unknown>)[method]).toBe("function");
  });

  test("answers with a state, an email and a plan, and nothing else", async () => {
    writeFileSync(path.join(systemDirs.codex, "auth.json"), AUTH_FILE);
    const reply = await providerAccountsApi.identity({ providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID });
    expect(reply).toEqual({
      ok: true,
      identity: { state: "signed-in", email: "dev@example.com", plan: "Plus", checkedAt: expect.any(Number) },
    });
    const wire = JSON.stringify(reply);
    for (const secret of ["SENTINEL", "sk-", "id_token", "tokens", root]) expect(wire).not.toContain(secret);

    const claude = await providerAccountsApi.identity({ providerId: "claude-code", profileId: SYSTEM_ACCOUNT_PROFILE_ID });
    expect(claude).toEqual({
      ok: true,
      identity: { state: "signed-in", email: "claude@example.com", plan: "Max", checkedAt: expect.any(Number) },
    });
    expect(JSON.stringify(claude)).not.toContain(root);
  });

  test("probes a managed account with that account's own folder and caches the answer", async () => {
    const account = registry.create({ providerId: "claude-code", label: "Work" });
    const args = { providerId: "claude-code", profileId: account.id } as const;
    expect((await providerAccountsApi.identity(args)).ok).toBe(true);
    await providerAccountsApi.identity(args);
    expect(probes).toEqual([{ commandArgs: ["auth", "status", "--json"], config: account.configDirectory }]);
    await providerAccountsApi.identity({ ...args, refresh: true });
    expect(probes).toHaveLength(2);
  });

  test("rejects unknown fields, bad values and accounts that do not exist before any probe runs", async () => {
    const account = registry.create({ providerId: "codex", label: "Work" });
    for (const input of [
      { providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID, token: "SENTINEL" },
      { providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID, configDirectory: root },
      { providerId: "cursor", profileId: SYSTEM_ACCOUNT_PROFILE_ID },
      { providerId: "codex", profileId: "not-an-id" },
      { providerId: "codex", profileId: account.id, refresh: "yes" },
      { providerId: "codex", profileId: account.id, binaryPath: "" },
    ])
      expect((await providerAccountsApi.identity(input as never)).ok).toBe(false);
    expect(await providerAccountsApi.identity({ providerId: "codex", profileId: crypto.randomUUID() })).toEqual({
      ok: false,
      message: "The provider account no longer exists.",
    });
    expect(await providerAccountsApi.identity({ providerId: "claude-code", profileId: account.id })).toEqual({
      ok: false,
      message: "The provider account no longer exists.",
    });
    expect(probes).toHaveLength(0);
  });

  test("a failing probe answers unknown without leaking the failure", async () => {
    handlers.clear();
    registerProviderAccountIdentityHandlers({
      ...deps,
      buildEnv: () => {
        throw new Error(`${root}/private-folder is unreadable SENTINEL-TOKEN`);
      },
    });
    const reply = await providerAccountsApi.identity({ providerId: "codex", profileId: SYSTEM_ACCOUNT_PROFILE_ID });
    expect(reply).toMatchObject({ ok: true, identity: { state: "unknown", reason: "failed" } });
    expect(JSON.stringify(reply)).not.toContain("SENTINEL");
    expect(JSON.stringify(reply)).not.toContain(root);
    if (reply.ok) expect(describeProviderAccountIdentity(reply.identity, "Codex").text).toBe("Can't check sign-in");
  });
});

describe("provider account setup bridge", () => {
  function claudeSystemSetup() {
    mkdirSync(path.join(systemDirs["claude-code"], "skills", "review"), { recursive: true });
    writeFileSync(path.join(systemDirs["claude-code"], "skills", "review", "SKILL.md"), "SENTINEL-SKILL-BODY");
    writeFileSync(path.join(systemDirs["claude-code"], "CLAUDE.md"), "SENTINEL-INSTRUCTIONS");
    writeFileSync(path.join(systemDirs["claude-code"], "settings.json"), JSON.stringify({ model: "opus", env: { ANTHROPIC_API_KEY: "sk-SENTINEL" } }));
    writeFileSync(path.join(systemDirs["claude-code"], ".credentials.json"), "SENTINEL-CREDENTIALS");
  }

  test("turns sharing on and off for a managed account and replies with names and states only", async () => {
    claudeSystemSetup();
    const account = registry.create({ providerId: "claude-code", label: "Work" });
    const args = { providerId: "claude-code", id: account.id } as const;

    const before = await providerAccountsApi.setupStatus(args);
    expect(before.ok && before.setup.enabled).toBe(false);

    const on = await providerAccountsApi.shareSetup({ ...args, enabled: true });
    expect(on).toEqual({
      ok: true,
      setup: {
        enabled: true,
        settingsMode: "link",
        mcp: { useSystemMcp: false, delegateMcpWork: false, delegable: EMPTY_DELEGABLE },
        entries: [
          { name: "skills", label: "skills", action: "link", state: "shared" },
          { name: "agents", label: "agents", action: "link", state: "missing" },
          { name: "commands", label: "commands", action: "link", state: "missing" },
          { name: "plugins", label: "plugins", action: "link", state: "missing" },
          { name: "CLAUDE.md", label: "instructions", action: "link", state: "shared" },
          { name: "settings.json", label: "settings", action: "copy", state: "shared" },
          { name: "mcpServers", label: "MCP servers", action: "link", state: "missing" },
        ],
      },
    });
    const wire = JSON.stringify(on);
    for (const leaked of ["SENTINEL", "sk-", root]) expect(wire).not.toContain(leaked);
    expect(readFileSync(path.join(account.configDirectory!, "CLAUDE.md"), "utf8")).toBe("SENTINEL-INSTRUCTIONS");
    expect(JSON.parse(readFileSync(path.join(account.configDirectory!, "settings.json"), "utf8"))).toEqual({ model: "opus" });

    const off = await providerAccountsApi.shareSetup({ ...args, enabled: false });
    expect(off.ok && off.setup.enabled).toBe(false);
    expect(readFileSync(path.join(systemDirs["claude-code"], "CLAUDE.md"), "utf8")).toBe("SENTINEL-INSTRUCTIONS");
  });

  test("changes a Claude account's MCP options one at a time", async () => {
    claudeSystemSetup();
    const account = registry.create({ providerId: "claude-code", label: "Personal" });
    const args = { providerId: "claude-code", id: account.id } as const;
    const on = await providerAccountsApi.mcpOptions({ ...args, useSystemMcp: true });
    expect(on.ok && on.setup.enabled).toBe(false);
    expect(on.ok && on.setup.mcp).toEqual({ useSystemMcp: true, delegateMcpWork: false, delegable: EMPTY_DELEGABLE });
    expect(existsSync(path.join(account.configDirectory!, "CLAUDE.md"))).toBe(false);
    for (const leaked of ["SENTINEL", root]) expect(JSON.stringify(on)).not.toContain(leaked);
    const both = await providerAccountsApi.mcpOptions({ ...args, delegateMcpWork: true });
    expect(both.ok && both.setup.mcp).toEqual({ useSystemMcp: true, delegateMcpWork: true, delegable: EMPTY_DELEGABLE });
    const off = await providerAccountsApi.mcpOptions({ ...args, useSystemMcp: false, delegateMcpWork: false });
    expect(off.ok && off.setup.mcp).toEqual({ useSystemMcp: false, delegateMcpWork: false, delegable: EMPTY_DELEGABLE });

    // What the option would hand over is listed by name before it is turned on, and never with a URL or a sign-in.
    writeFileSync(path.join(systemDirs["claude-code"], ".claude.json"), JSON.stringify({
      oauthAccount: { emailAddress: "SENTINEL-IDENTITY@example.test" },
      mcpServers: { reports: { type: "http", url: "https://SENTINEL.example.test/mcp" } },
      claudeAiMcpEverConnected: ["claude.ai Company - MCP Gateway"],
    }));
    const preview = await providerAccountsApi.setupStatus(args);
    expect(preview.ok && preview.setup.mcp).toEqual({
      useSystemMcp: false,
      delegateMcpWork: false,
      delegable: [{ id: "system-default", observedAt: null, label: "System default", servers: ["claude.ai Company - MCP Gateway", "reports"] }],
    });
    expect(JSON.stringify(preview)).not.toContain("SENTINEL");

    const codex = registry.create({ providerId: "codex", label: "Work" });
    expect(await providerAccountsApi.mcpOptions({ providerId: "codex", id: codex.id, useSystemMcp: true })).toEqual({
      ok: false,
      message: "This account has no MCP options.",
    });
    for (const input of [
      { ...args, useSystemMcp: true, sourceDir: root },
      { ...args, useSystemMcp: "true" },
      { ...args, enabled: true },
      { providerId: "claude-code", id: SYSTEM_ACCOUNT_PROFILE_ID, delegateMcpWork: true },
    ])
      expect((await providerAccountsApi.mcpOptions(input as never)).ok).toBe(false);
  });

  test("only accounts Stave created take part", async () => {
    const external = registry.create({ providerId: "codex", label: "Mine", configDirectory: mkdtempSync(path.join(root, "own-")) });
    expect(await providerAccountsApi.shareSetup({ providerId: "codex", id: external.id, enabled: true })).toEqual({
      ok: false,
      message: "Only accounts Stave created can share the System default setup.",
    });
    expect(await providerAccountsApi.setupStatus({ providerId: "codex", id: crypto.randomUUID() })).toEqual({
      ok: false,
      message: "The provider account no longer exists.",
    });
  });

  test("rejects extra fields, paths and System default before touching the disk", async () => {
    const account = registry.create({ providerId: "codex", label: "Work" });
    for (const input of [
      { providerId: "codex", id: account.id, enabled: true, sourceDir: root },
      { providerId: "codex", id: account.id, enabled: "true" },
      { providerId: "codex", id: SYSTEM_ACCOUNT_PROFILE_ID, enabled: true },
      { providerId: "cursor", id: account.id, enabled: true },
    ])
      expect((await providerAccountsApi.shareSetup(input as never)).ok).toBe(false);
    expect((await providerAccountsApi.setupStatus({ providerId: "codex", id: account.id, profileId: "x" } as never)).ok).toBe(false);
  });
});
