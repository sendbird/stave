import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildMcpDelegationBrief,
  buildMcpDelegationPrompt,
  listMcpDelegationAccounts,
  MCP_DELEGATION_MODEL,
  resolveMcpDelegationTarget,
  type McpDelegationDirectory,
} from "../electron/provider-accounts/mcp-delegation";
import {
  clearClaudeAccountMcpStatus,
  readClaudeAccountMcpStatus,
  recordClaudeAccountMcpStatus,
} from "../electron/provider-accounts/mcp-status-cache";
import { buildCodexMcpDelegationPrompt, resolveCodexMcpDelegationTarget } from "../electron/provider-accounts/codex-mcp-delegation";
import { DEFAULT_CODEX_MCP_DELEGATION_SETTINGS } from "../src/lib/providers/codex-mcp-delegation-settings";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import { observeClaudeMcpReadiness } from "../electron/providers/claude-mcp-readiness-summary";
import { ACCOUNT_MCP_OPTIONS_FILE_NAME, SETUP_SHARING_LEDGER_NAME } from "../electron/provider-accounts/shared-mcp";
import { buildClaudeSystemPrompt } from "../electron/providers/claude-system-prompt";
import type { ProviderAccountProfile } from "../src/lib/providers/provider-accounts";

// Every file here is fabricated inside a temp directory. No real config folder is read.
// Status readings default to STAVE_USER_DATA_PATH; unset it so a run inside
// Stave keeps them in memory instead of the real app data folder.
const previousUserDataPath = process.env.STAVE_USER_DATA_PATH;
beforeAll(() => { delete process.env.STAVE_USER_DATA_PATH; });
afterAll(() => {
  if (previousUserDataPath !== undefined) process.env.STAVE_USER_DATA_PATH = previousUserDataPath;
});
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const SIDE = "22222222-2222-4222-8222-222222222222";
const CONNECTION = "33333333-3333-4333-8333-333333333333";

function writeJson(target: string, value: unknown) {
  writeFileSync(target, JSON.stringify(value));
}

function layout(options: { delegate?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "stave-mcp-delegation-"));
  roots.push(root);
  const dirs = { system: path.join(root, "system"), [PERSONAL]: path.join(root, "personal"), [SIDE]: path.join(root, "side") };
  for (const directory of Object.values(dirs)) mkdirSync(directory);
  writeJson(path.join(dirs.system, ".claude.json"), {
    oauthAccount: { emailAddress: "SENTINEL-IDENTITY@example.test" },
    mcpServers: { reports: { type: "http", url: "https://reports.example.test/mcp" }, ads: { command: "ads" }, "stave-local-mcp": { type: "http", url: "http://127.0.0.1:1/mcp" } },
    claudeAiMcpEverConnected: ["claude.ai Slack", "claude.ai Company - MCP Gateway", 7],
  });
  writeJson(path.join(dirs[PERSONAL], ".claude.json"), { mcpServers: { notes: { command: "notes" } }, claudeAiMcpEverConnected: ["claude.ai Slack"] });
  writeJson(path.join(dirs[SIDE], ".claude.json"), { mcpServers: { notes: { command: "notes" } } });
  if (options.delegate !== false) writeJson(path.join(dirs[PERSONAL], ACCOUNT_MCP_OPTIONS_FILE_NAME), { version: 1, delegateMcpWork: true });
  const profiles: ProviderAccountProfile[] = [
    { id: "system-default", providerId: "claude-code", label: "System default", kind: "system" },
    { id: "system-default", providerId: "codex", label: "System default", kind: "system" },
    { id: PERSONAL, providerId: "claude-code", label: "Personal", kind: "managed", configDirectory: dirs[PERSONAL] },
    { id: SIDE, providerId: "claude-code", label: "Side", kind: "managed", configDirectory: dirs[SIDE] },
    { id: CONNECTION, providerId: "claude-code", label: "Gateway", kind: "managed", gateway: { baseUrl: "https://gateway.example.test", secretId: "secret", models: ["m"] } } as ProviderAccountProfile,
  ];
  const directory: McpDelegationDirectory = {
    profiles,
    resolveDirectory: (profileId) => (dirs as Record<string, string>)[profileId] ?? null,
    systemDirectory: () => dirs.system,
    sharedSystemConfigDir: () => dirs.system,
  };
  return { dirs, directory };
}

describe("which accounts can do MCP work the calling account cannot", () => {
  test("lists another account's servers and connectors the caller lacks, by name only", () => {
    const { directory } = layout();
    const offered = listMcpDelegationAccounts(PERSONAL, directory);
    expect(offered).toEqual([
      { id: "system-default", label: "System default", servers: ["ads", "claude.ai Company - MCP Gateway", "reports"] },
    ]);
    expect(JSON.stringify(offered)).not.toContain("SENTINEL");
    expect(JSON.stringify(offered)).not.toContain("example.test");
  });

  test("is empty until the calling account turns the option on, and for System default and API connections", () => {
    const off = layout({ delegate: false }).directory;
    expect(listMcpDelegationAccounts(PERSONAL, off)).toEqual([]);
    // Settings previews what turning it on would hand over.
    expect(listMcpDelegationAccounts(PERSONAL, off, { preview: true }).map((account) => account.id)).toEqual(["system-default"]);
    expect(listMcpDelegationAccounts("system-default", off, { preview: true })).toEqual([]);
    const { directory } = layout();
    expect(listMcpDelegationAccounts("system-default", directory)).toEqual([]);
    expect(listMcpDelegationAccounts(CONNECTION, directory)).toEqual([]);
    expect(listMcpDelegationAccounts("missing", directory)).toEqual([]);
    // Side has the option off, so it is offered nothing even though System default has more.
    expect(listMcpDelegationAccounts(SIDE, directory)).toEqual([]);
  });

  test("servers the caller already gets through sharing are not delegated; connectors still are", () => {
    const { dirs, directory } = layout();
    writeJson(path.join(dirs[PERSONAL], SETUP_SHARING_LEDGER_NAME), { version: 1, sharedFrom: dirs.system, links: {}, copies: {} });
    expect(listMcpDelegationAccounts(PERSONAL, directory)).toEqual([
      { id: "system-default", label: "System default", servers: ["claude.ai Company - MCP Gateway"] },
    ]);
  });

  test("a server that still needs sign-in counts as missing on that account", () => {
    const { dirs, directory } = layout();
    writeJson(path.join(dirs[PERSONAL], SETUP_SHARING_LEDGER_NAME), { version: 1, sharedFrom: dirs.system, links: {}, copies: {} });
    // Shared to Personal, but only System default signed in to it.
    writeJson(path.join(dirs[PERSONAL], "mcp-needs-auth-cache.json"), { reports: { timestamp: 1 } });
    expect(listMcpDelegationAccounts(PERSONAL, directory)[0]?.servers).toEqual(["claude.ai Company - MCP Gateway", "reports"]);
    // Nobody signed in: nothing to hand over for it.
    writeJson(path.join(dirs.system, "mcp-needs-auth-cache.json"), { reports: { timestamp: 1 }, "claude.ai Company - MCP Gateway": { timestamp: 1 } });
    expect(listMcpDelegationAccounts(PERSONAL, directory)).toEqual([]);
  });

  test("a recent status reading from a turn replaces the files for that account", () => {
    const { directory } = layout();
    const live: McpDelegationDirectory = {
      ...directory,
      // System default: the gateway connector is gone, a plugin server is connected.
      connectedServers: (id) => (id === "system-default" ? ["reports", "plugin:figma:figma", "stave-local-mcp"] : null),
    };
    expect(listMcpDelegationAccounts(PERSONAL, live)).toEqual([
      { id: "system-default", label: "System default", servers: ["plugin:figma:figma", "reports"] },
    ]);
    // A reading for the caller too: what it has connected is not handed over.
    const both: McpDelegationDirectory = { ...live, connectedServers: (id) => (id === PERSONAL ? ["reports"] : live.connectedServers!(id)) };
    expect(listMcpDelegationAccounts(PERSONAL, both)[0]?.servers).toEqual(["plugin:figma:figma"]);
  });

  test("an account folder that cannot be resolved is skipped", () => {
    const { directory } = layout();
    const broken: McpDelegationDirectory = { ...directory, resolveDirectory: (id) => { if (id === SIDE) throw new Error("moved"); return directory.resolveDirectory(id); } };
    expect(listMcpDelegationAccounts(PERSONAL, broken).map((account) => account.id)).toEqual(["system-default"]);
  });
});

describe("status readings kept from turns", () => {
  test("reads names from disk after clearing memory, expires after 12 hours and removes deleted accounts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "stave-mcp-cache-"));
    roots.push(root);
    const registry = new ProviderAccountRegistry(root);
    const account = registry.create({ providerId: "claude-code", label: "Work" });
    const file = path.join(root, "provider-accounts", "mcp-status", `${account.id}.json`);
    const connected = { name: "Reports", status: "connected", credentials: "SENTINEL" };
    recordClaudeAccountMcpStatus(account.id, [connected, { name: "Slack", status: "needs-auth" }], 1_000, { userDataPath: root });
    clearClaudeAccountMcpStatus();
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ connected: ["Reports"], observedAt: 1_000 });
    const expires = 1_000 + 12 * 60 * 60 * 1_000;
    expect(readClaudeAccountMcpStatus(account.id, expires, root)?.connected).toEqual(["Reports"]);
    expect(readClaudeAccountMcpStatus(account.id, expires + 1, root)).toBeNull();
    registry.remove({ id: account.id, providerId: "claude-code" });
    expect(existsSync(file)).toBe(false);
    expect(readClaudeAccountMcpStatus(account.id, 2_000, root)).toBeNull();
  });

  test("keeps the connected names per account, ignores a Stave-only reading, and expires", () => {
    clearClaudeAccountMcpStatus();
    recordClaudeAccountMcpStatus("a", [
      { name: "reports", status: "connected" },
      { name: "gestalt", status: "needs-auth" },
      { name: "stave-local-mcp", status: "connected" },
    ], 1_000);
    expect(readClaudeAccountMcpStatus("a", 2_000)).toEqual({ connected: ["reports"], observedAt: 1_000 });
    // A strict-MCP turn sees only Stave's server; it must not erase what is known.
    recordClaudeAccountMcpStatus("a", [{ name: "stave-local-mcp", status: "connected" }], 3_000);
    expect(readClaudeAccountMcpStatus("a", 4_000)?.observedAt).toBe(1_000);
    expect(readClaudeAccountMcpStatus("b", 4_000)).toBeNull();
    expect(readClaudeAccountMcpStatus("a", 1_000 + 13 * 60 * 60 * 1_000)).toBeNull();
    clearClaudeAccountMcpStatus();
  });

  test("a turn's readiness probe records them for the account the turn runs on", () => {
    clearClaudeAccountMcpStatus();
    const summary = withProviderAccountScope({ claudeAccountProfileId: PERSONAL }, () =>
      observeClaudeMcpReadiness([
        { name: "claude.ai Slack", status: "connected" },
        { name: "gestalt", status: "needs-auth" },
      ]));
    expect(summary).toEqual({ pending: [], unavailable: [{ name: "gestalt", status: "needs-auth" }] });
    expect(readClaudeAccountMcpStatus(PERSONAL)?.connected).toEqual(["claude.ai Slack"]);
    expect(readClaudeAccountMcpStatus("system-default")).toBeNull();
    clearClaudeAccountMcpStatus();
  });
});

describe("the account a delegation names", () => {
  test("is accepted by id or label only when it is offered to the caller", () => {
    const { directory } = layout();
    const resolve = (requested: string, callerAccountProfileId = PERSONAL) => resolveMcpDelegationTarget({ callerAccountProfileId, requested, directory });
    expect(resolve("system-default")).toEqual({ ok: true, accountProfileId: "system-default", label: "System default" });
    expect(resolve(" system DEFAULT ")).toEqual({ ok: true, accountProfileId: "system-default", label: "System default" });
    // Any other signed-in account is accepted: which servers it has is advice, not a gate.
    expect(resolve(SIDE)).toEqual({ ok: true, accountProfileId: SIDE, label: "Side" });
    const unknown = resolve(CONNECTION);
    expect(unknown.ok).toBe(false);
    expect(!unknown.ok && unknown.message).toContain('"system-default" (System default)');
    expect(resolve(PERSONAL).ok).toBe(false);
    const off = resolve("system-default", SIDE);
    expect(!off.ok && off.message).toContain("Settings > Accounts");
  });
});

test("Codex authorization checks the global option and only its selected Claude account", () => {
  const { directory } = layout({ delegate: false });
  const off = DEFAULT_CODEX_MCP_DELEGATION_SETTINGS;
  expect(resolveCodexMcpDelegationTarget(off, "system-default", directory)).toMatchObject({ ok: false });
  expect(buildCodexMcpDelegationPrompt(off, [], directory)).toBeNull();
  const enabled = { ...off, enabled: true };
  expect(resolveCodexMcpDelegationTarget(enabled, "System default", directory)).toMatchObject({ ok: true, accountProfileId: "system-default" });
  expect(resolveCodexMcpDelegationTarget(enabled, PERSONAL, directory)).toMatchObject({ ok: false });
  const note = buildCodexMcpDelegationPrompt(enabled, ["slack", "Company_MCP_Gateway"], directory);
  expect(note).toContain("reports");
  expect(note).not.toContain("claude.ai Slack");
  expect(note).not.toContain("Company - MCP Gateway");
  const renamedDirectory = {
    ...directory, profiles: directory.profiles.map((profile) => ({ ...profile, label: `${profile.label} renamed` })),
  };
  expect(buildCodexMcpDelegationPrompt(enabled, ["company-mcp-gateway", "Slack"], renamedDirectory)).toBe(note);
});

describe("what the session reads", () => {
  test("names the accounts, the servers and how to delegate one step", () => {
    const { directory } = layout();
    const note = buildMcpDelegationPrompt(listMcpDelegationAccounts(PERSONAL, directory))!;
    expect(note).toContain('account "system-default" (System default): ads, claude.ai Company - MCP Gateway, reports');
    expect(note).toContain("stave_delegate_task");
    expect(note).toContain("`server`");
    expect(note).toContain("Never hand over the whole task");
    expect(note).toContain("one delegation instead of several small ones");
    expect(note).toContain("When a skill, command or instruction tells you to call a tool of one of these servers, delegate that step");
    expect(note).toContain("status: ok | partial | needs_auth | missing_connector | failed");
    expect(note).toContain(MCP_DELEGATION_MODEL);
    expect(buildMcpDelegationPrompt([])).toBeNull();
  });

  test("the subagent gets a fixed brief in the dynamic system prompt", () => {
    const brief = buildMcpDelegationBrief({ accountLabel: "System default", server: "claude.ai Company - MCP Gateway" });
    expect(brief).toContain("You run on the System default account");
    expect(brief).toContain('Use the MCP server "claude.ai Company - MCP Gateway" for this step.');
    expect(brief).toContain("status: ok | partial | needs_auth | missing_connector | failed");
    const [cached, , dynamic] = buildClaudeSystemPrompt({ cwd: "/repo", delegationBrief: brief });
    expect(dynamic).toContain(brief);
    expect(cached).not.toContain(brief);
    const unnamed = buildMcpDelegationBrief({ accountLabel: "Work" });
    expect(unnamed).toContain("Use the MCP server the request names.");
    expect(unnamed).not.toContain('Use the MCP server "');
  });

  test("reaches the system prompt's per-session part only when Stave's tools are attached", () => {
    const note = "MCP servers on your other Claude accounts:\n- account \"system-default\"";
    const [cached, , dynamic] = buildClaudeSystemPrompt({ cwd: "/repo", hasStaveLocalMcp: true, mcpDelegationPrompt: note });
    expect(dynamic).toContain(note);
    expect(cached).not.toContain("other Claude accounts");
    expect(buildClaudeSystemPrompt({ cwd: "/repo", hasStaveLocalMcp: false, mcpDelegationPrompt: note }).join("\n")).not.toContain("other Claude accounts");
    expect(buildClaudeSystemPrompt({ cwd: "/repo", hasStaveLocalMcp: true, mcpDelegationPrompt: null }).join("\n")).not.toContain("other Claude accounts");
  });
});
