import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applySetupSharing,
  filterClaudeSettings,
  readSetupSharing,
  removeSetupSharing,
  type SetupSharingTarget,
} from "../electron/provider-accounts/setup-sharing";
import { describeProviderAccountSetup } from "../src/lib/providers/provider-account-setup";
import {
  NEVER_SHARED_NAMES,
  setupSharingPlan,
  sharedSetupEntries,
  sharedSetupSummary,
} from "../src/lib/providers/provider-account-setup-plan";

// Every file here is fabricated inside a temp directory. No real config folder is read.
const roots: string[] = [];
function folders() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-setup-sharing-")));
  roots.push(root);
  const sourceDir = path.join(root, "system-default");
  const profileDir = path.join(root, "account");
  mkdirSync(sourceDir);
  mkdirSync(profileDir);
  return { root, sourceDir, profileDir };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function claudeSource(sourceDir: string) {
  write(path.join(sourceDir, "skills", "review", "SKILL.md"), "review skill");
  write(path.join(sourceDir, "agents", "helper.md"), "helper agent");
  write(path.join(sourceDir, "commands", "ship.md"), "ship command");
  write(path.join(sourceDir, "plugins", "installed_plugins.json"), "{}");
  write(path.join(sourceDir, "CLAUDE.md"), "my instructions");
  write(
    path.join(sourceDir, "settings.json"),
    JSON.stringify({
      model: "opus",
      permissions: { allow: ["Bash(git status)"] },
      hooks: { Stop: [] },
      apiKeyHelper: "print-secret SENTINEL-HELPER",
      forceLoginOrgUUID: "SENTINEL-ORG",
      env: { SAFE_FLAG: "1", ANTHROPIC_API_KEY: "sk-SENTINEL-API-KEY", GITHUB_TOKEN: "SENTINEL-GITHUB", ANTHROPIC_BASE_URL: "https://gateway.example" },
    }),
  );
  write(path.join(sourceDir, ".credentials.json"), '{"claudeAiOauth":{"accessToken":"SENTINEL-ACCESS-TOKEN"}}');
  write(path.join(sourceDir, ".claude.json"), '{"oauthAccount":{"emailAddress":"SENTINEL-IDENTITY"}}');
  write(path.join(sourceDir, "projects", "p", "session.jsonl"), "SENTINEL-HISTORY");
  write(path.join(sourceDir, "history.jsonl"), "SENTINEL-PROMPTS");
  write(path.join(sourceDir, "todos", "t.json"), "SENTINEL-TODO");
  write(path.join(sourceDir, "statsig", "s.json"), "SENTINEL-FLAGS");
}
function codexSource(sourceDir: string) {
  write(path.join(sourceDir, "skills", "review", "SKILL.md"), "review skill");
  write(path.join(sourceDir, "prompts", "ship.md"), "ship prompt");
  write(path.join(sourceDir, "AGENTS.md"), "my instructions");
  write(path.join(sourceDir, "config.toml"), 'experimental_bearer_token = "SENTINEL-BEARER"');
  write(path.join(sourceDir, "auth.json"), '{"tokens":{"access_token":"SENTINEL-ACCESS-TOKEN"}}');
  write(path.join(sourceDir, "history.jsonl"), "SENTINEL-PROMPTS");
  write(path.join(sourceDir, "sessions", "s.jsonl"), "SENTINEL-HISTORY");
}
const target = (providerId: SetupSharingTarget["providerId"], sourceDir: string, profileDir: string): SetupSharingTarget => ({
  providerId,
  sourceDir,
  profileDir,
});
const isLinkTo = (file: string, expected: string) => lstatSync(file).isSymbolicLink() && realpathSync(file) === realpathSync(expected);
const states = (setup: ReturnType<typeof applySetupSharing>) => Object.fromEntries(setup.entries.map((entry) => [entry.name, entry.state]));

function allText(directory: string): string {
  // Reads real files and never follows links, so only what the account itself holds is searched.
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) return entry.name;
      return entry.isDirectory() ? allText(full) : `${entry.name}\n${readFileSync(full, "utf8")}`;
    })
    .join("\n");
}

describe("sharing plan", () => {
  test("Claude links folders and instructions, copies filtered settings, and skips the login and history", () => {
    const actions = Object.fromEntries(setupSharingPlan("claude-code").map((entry) => [entry.name, entry.action]));
    expect(actions).toEqual({
      skills: "link",
      agents: "link",
      commands: "link",
      plugins: "link",
      "CLAUDE.md": "link",
      "settings.json": "copy",
      ".credentials.json": "skip",
      ".claude.json": "skip",
      projects: "skip",
      "history.jsonl": "skip",
      todos: "skip",
      "shell-snapshots": "skip",
      statsig: "skip",
    });
    expect(setupSharingPlan("claude-code").find((entry) => entry.name === "settings.json")?.filter).toBe("claude-settings");
  });

  test("Codex links skills, prompts and instructions and skips config, login and history", () => {
    const actions = Object.fromEntries(setupSharingPlan("codex").map((entry) => [entry.name, entry.action]));
    expect(actions).toEqual({
      skills: "link",
      prompts: "link",
      "AGENTS.md": "link",
      "config.toml": "skip",
      "auth.json": "skip",
      "history.jsonl": "skip",
      sessions: "skip",
    });
  });

  test("no entry that is linked or copied can be a login or a history", () => {
    for (const providerId of ["claude-code", "codex"] as const) {
      for (const entry of sharedSetupEntries(providerId)) expect(NEVER_SHARED_NAMES.has(entry.name)).toBe(false);
      for (const entry of setupSharingPlan(providerId))
        if (NEVER_SHARED_NAMES.has(entry.name)) expect(entry.action).toBe("skip");
    }
    for (const name of [".credentials.json", "auth.json", ".claude.json", "projects", "sessions", "history.jsonl"])
      expect(NEVER_SHARED_NAMES.has(name)).toBe(true);
  });

  test("names what is shared in plain words", () => {
    expect(sharedSetupSummary("claude-code")).toBe("skills, agents, commands, plugins, instructions and settings");
    expect(sharedSetupSummary("codex")).toBe("skills, prompts and instructions");
    expect(describeProviderAccountSetup("codex", null)).toBe(
      "Shares your skills, prompts and instructions from System default with this account. Sign-in and conversation history are never shared.",
    );
  });
});

describe("settings filter", () => {
  test("drops login rules and credential-like env while keeping preferences", () => {
    expect(
      filterClaudeSettings({
        model: "opus",
        hooks: { Stop: [] },
        includeCoAuthoredBy: false,
        apiKeyHelper: "x",
        awsAuthRefresh: "x",
        awsCredentialExport: "x",
        otelHeadersHelper: "x",
        forceLoginMethod: "claudeai",
        forceLoginOrgUUID: "x",
        env: {
          SAFE_FLAG: "1",
          DISABLE_AUTOUPDATER: "1",
          ANTHROPIC_API_KEY: "x",
          ANTHROPIC_AUTH_TOKEN: "x",
          ANTHROPIC_BASE_URL: "x",
          CLAUDE_CODE_OAUTH_TOKEN: "x",
          CLAUDE_CODE_USE_BEDROCK: "1",
          AWS_PROFILE: "x",
          GITHUB_TOKEN: "x",
          MY_SERVICE_SECRET: "x",
          DB_PASSWORD: "x",
        },
      }),
    ).toEqual({
      model: "opus",
      hooks: { Stop: [] },
      includeCoAuthoredBy: false,
      env: { SAFE_FLAG: "1", DISABLE_AUTOUPDATER: "1" },
    });
  });

  test("removes env when nothing safe is left and when it is not an object", () => {
    expect(filterClaudeSettings({ model: "opus", env: { ANTHROPIC_API_KEY: "x" } })).toEqual({ model: "opus" });
    expect(filterClaudeSettings({ model: "opus", env: "ANTHROPIC_API_KEY=x" })).toEqual({ model: "opus" });
  });
});

describe("sharing into a managed Claude account", () => {
  test("links folders and instructions, copies filtered settings, and carries no login or history", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const setup = applySetupSharing(target("claude-code", sourceDir, profileDir));
    expect(setup.enabled).toBe(true);
    expect(states(setup)).toEqual({
      skills: "shared",
      agents: "shared",
      commands: "shared",
      plugins: "shared",
      "CLAUDE.md": "shared",
      "settings.json": "shared",
    });
    for (const name of ["skills", "agents", "commands", "plugins", "CLAUDE.md"])
      expect(isLinkTo(path.join(profileDir, name), path.join(sourceDir, name))).toBe(true);

    const settingsPath = path.join(profileDir, "settings.json");
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(false);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      model: "opus",
      permissions: { allow: ["Bash(git status)"] },
      hooks: { Stop: [] },
      env: { SAFE_FLAG: "1" },
    });

    expect(readdirSync(profileDir).sort()).toEqual([
      ".stave-shared-setup.json",
      "CLAUDE.md",
      "agents",
      "commands",
      "plugins",
      "settings.json",
      "skills",
    ]);
    const held = allText(profileDir);
    expect(held).not.toContain("SENTINEL");
    expect(held).not.toContain("sk-SENTINEL");
    for (const skipped of [".credentials.json", ".claude.json", "projects", "history.jsonl", "todos", "statsig"])
      expect(existsSync(path.join(profileDir, skipped))).toBe(false);
  });

  test("a skill added later appears in the account because the folder is linked", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    applySetupSharing(target("claude-code", sourceDir, profileDir));
    write(path.join(sourceDir, "skills", "later", "SKILL.md"), "added afterwards");
    expect(readFileSync(path.join(profileDir, "skills", "later", "SKILL.md"), "utf8")).toBe("added afterwards");
  });

  test("repeating it changes nothing, and refreshes settings only while the copy is untouched", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan, { settingsMode: "copy" });
    expect(states(applySetupSharing(plan))["settings.json"]).toBe("shared");

    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "sonnet" }));
    expect(states(applySetupSharing(plan))["settings.json"]).toBe("shared");
    expect(JSON.parse(readFileSync(path.join(profileDir, "settings.json"), "utf8"))).toEqual({ model: "sonnet" });

    write(path.join(profileDir, "settings.json"), JSON.stringify({ model: "mine" }));
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "haiku" }));
    expect(states(applySetupSharing(plan))["settings.json"]).toBe("kept");
    expect(JSON.parse(readFileSync(path.join(profileDir, "settings.json"), "utf8"))).toEqual({ model: "mine" });
  });

  test("links settings by default when they hold no credential, so a change applies to both", () => {
    const { sourceDir, profileDir } = folders();
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "opus", hooks: { Stop: [] } }));
    const setup = applySetupSharing(target("claude-code", sourceDir, profileDir));
    expect(setup.settingsMode).toBe("link");
    expect(setup.entries.find((entry) => entry.name === "settings.json")).toMatchObject({ action: "link", state: "shared" });
    expect(isLinkTo(path.join(profileDir, "settings.json"), path.join(sourceDir, "settings.json"))).toBe(true);
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "sonnet" }));
    expect(JSON.parse(readFileSync(path.join(profileDir, "settings.json"), "utf8"))).toEqual({ model: "sonnet" });
    expect(readSetupSharing(target("claude-code", sourceDir, profileDir)).entries.at(-1)).toMatchObject({ action: "link", state: "shared" });
  });

  test("copies settings through the filter even in link mode while they name a credential", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const setup = applySetupSharing(target("claude-code", sourceDir, profileDir), { settingsMode: "link" });
    expect(setup.settingsMode).toBe("link");
    expect(setup.entries.find((entry) => entry.name === "settings.json")).toMatchObject({ action: "copy", state: "shared" });
    expect(lstatSync(path.join(profileDir, "settings.json")).isSymbolicLink()).toBe(false);
    expect(allText(profileDir)).not.toContain("SENTINEL");
  });

  test("switches settings between a link and a copy and keeps a copy the account edited", () => {
    const { sourceDir, profileDir } = folders();
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "opus" }));
    const plan = target("claude-code", sourceDir, profileDir);
    const settingsPath = path.join(profileDir, "settings.json");
    applySetupSharing(plan, { settingsMode: "copy" });
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(false);

    // Repeating without a mode keeps the account's choice.
    expect(applySetupSharing(plan).settingsMode).toBe("copy");
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(false);

    expect(states(applySetupSharing(plan, { settingsMode: "link" }))["settings.json"]).toBe("shared");
    expect(isLinkTo(settingsPath, path.join(sourceDir, "settings.json"))).toBe(true);

    expect(states(applySetupSharing(plan, { settingsMode: "copy" }))["settings.json"]).toBe("shared");
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(path.join(sourceDir, "settings.json"), "utf8")).toBe(JSON.stringify({ model: "opus" }));

    write(settingsPath, JSON.stringify({ model: "mine" }));
    expect(states(applySetupSharing(plan, { settingsMode: "link" }))["settings.json"]).toBe("kept");
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({ model: "mine" });

    removeSetupSharing(plan);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({ model: "mine" });
  });

  test("an account shared before settings modes existed keeps its copy", () => {
    const { sourceDir, profileDir } = folders();
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "opus" }));
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan, { settingsMode: "copy" });
    const ledgerPath = path.join(profileDir, ".stave-shared-setup.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    delete ledger.settingsMode;
    writeFileSync(ledgerPath, JSON.stringify(ledger));
    expect(readSetupSharing(plan).settingsMode).toBe("copy");
    expect(applySetupSharing(plan).settingsMode).toBe("copy");
    expect(lstatSync(path.join(profileDir, "settings.json")).isSymbolicLink()).toBe(false);
  });

  test("removing sharing removes a settings link Stave made and leaves System default", () => {
    const { sourceDir, profileDir } = folders();
    write(path.join(sourceDir, "settings.json"), JSON.stringify({ model: "opus" }));
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan);
    removeSetupSharing(plan);
    expect(existsSync(path.join(profileDir, "settings.json"))).toBe(false);
    expect(readFileSync(path.join(sourceDir, "settings.json"), "utf8")).toBe(JSON.stringify({ model: "opus" }));
  });

  test("keeps what the account already owns and reports what System default lacks", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    rmSync(path.join(sourceDir, "plugins"), { recursive: true });
    write(path.join(profileDir, "CLAUDE.md"), "account's own instructions");
    write(path.join(profileDir, "agents", "own.md"), "own agent");
    mkdirSync(path.join(profileDir, "commands"));
    const setup = applySetupSharing(target("claude-code", sourceDir, profileDir));
    expect(states(setup)).toEqual({
      skills: "shared",
      agents: "kept",
      commands: "shared",
      plugins: "missing",
      "CLAUDE.md": "kept",
      "settings.json": "shared",
    });
    expect(readFileSync(path.join(profileDir, "CLAUDE.md"), "utf8")).toBe("account's own instructions");
    expect(readFileSync(path.join(profileDir, "agents", "own.md"), "utf8")).toBe("own agent");
    expect(isLinkTo(path.join(profileDir, "commands"), path.join(sourceDir, "commands"))).toBe(true);
    expect(describeProviderAccountSetup("claude-code", setup)).toBe(
      "Sharing skills, commands, and settings from System default. Kept this account's own agents and instructions. Sign-in and conversation history are never shared.",
    );
  });

  test("follows a System default folder that is itself a link to its real location", () => {
    const { root, sourceDir, profileDir } = folders();
    write(path.join(root, "elsewhere", "skills", "one", "SKILL.md"), "relocated");
    symlinkSync(path.join(root, "elsewhere", "skills"), path.join(sourceDir, "skills"), "dir");
    applySetupSharing(target("claude-code", sourceDir, profileDir));
    expect(realpathSync(path.join(profileDir, "skills"))).toBe(realpathSync(path.join(root, "elsewhere", "skills")));
  });

  test("does not copy a settings file it cannot parse", () => {
    const { sourceDir, profileDir } = folders();
    write(path.join(sourceDir, "settings.json"), "{ apiKeyHelper: SENTINEL-HELPER");
    const setup = applySetupSharing(target("claude-code", sourceDir, profileDir));
    expect(states(setup)["settings.json"]).toBe("failed");
    expect(existsSync(path.join(profileDir, "settings.json"))).toBe(false);
    expect(allText(profileDir)).not.toContain("SENTINEL");
  });

  test("replaces a dangling link Stave made earlier and leaves a link someone else aimed elsewhere", () => {
    const { root, sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan);
    // System default's skills folder is itself a link that moves, so Stave's old link now dangles.
    const first = path.join(root, "skills-a");
    const moved = path.join(root, "skills-b");
    write(path.join(first, "x", "SKILL.md"), "first");
    write(path.join(moved, "x", "SKILL.md"), "moved");
    rmSync(path.join(sourceDir, "skills"), { recursive: true });
    rmSync(path.join(profileDir, "skills"));
    symlinkSync(first, path.join(sourceDir, "skills"), "dir");
    applySetupSharing(plan);
    expect(realpathSync(path.join(profileDir, "skills"))).toBe(realpathSync(first));
    rmSync(path.join(sourceDir, "skills"));
    rmSync(first, { recursive: true });
    symlinkSync(moved, path.join(sourceDir, "skills"), "dir");
    expect(existsSync(path.join(profileDir, "skills"))).toBe(false);
    expect(lstatSync(path.join(profileDir, "skills")).isSymbolicLink()).toBe(true);
    expect(states(applySetupSharing(plan)).skills).toBe("shared");
    expect(realpathSync(path.join(profileDir, "skills"))).toBe(realpathSync(moved));

    const own = path.join(root, "own-agents");
    mkdirSync(own);
    rmSync(path.join(profileDir, "agents"));
    symlinkSync(own, path.join(profileDir, "agents"), "dir");
    expect(states(applySetupSharing(plan)).agents).toBe("kept");
    expect(realpathSync(path.join(profileDir, "agents"))).toBe(realpathSync(own));
  });

  test("refuses to share into System default's own folder", () => {
    const { sourceDir } = folders();
    claudeSource(sourceDir);
    expect(() => applySetupSharing(target("claude-code", sourceDir, sourceDir))).toThrow("System default folder");
    expect(() => removeSetupSharing(target("claude-code", sourceDir, sourceDir))).toThrow("System default folder");
    expect(readFileSync(path.join(sourceDir, "CLAUDE.md"), "utf8")).toBe("my instructions");
  });
});

describe("status and turning sharing off", () => {
  test("reads state without writing", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const before = readSetupSharing(target("claude-code", sourceDir, profileDir));
    expect(before.enabled).toBe(false);
    expect(before.entries.every((entry) => entry.state === "not-shared")).toBe(true);
    expect(readdirSync(profileDir)).toEqual([]);
    applySetupSharing(target("claude-code", sourceDir, profileDir));
    const after = readSetupSharing(target("claude-code", sourceDir, profileDir));
    expect(after.enabled).toBe(true);
    expect(after.entries.every((entry) => entry.state === "shared")).toBe(true);
  });

  test("removes only what Stave added and leaves System default and the account's own files alone", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    write(path.join(profileDir, "CLAUDE.md"), "account's own instructions");
    write(path.join(profileDir, ".credentials.json"), "account login SENTINEL-OWN-LOGIN");
    write(path.join(profileDir, "projects", "mine", "s.jsonl"), "account history");
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan);
    const off = removeSetupSharing(plan);
    expect(off.enabled).toBe(false);
    expect(readdirSync(profileDir).sort()).toEqual([".credentials.json", "CLAUDE.md", "projects"]);
    expect(readFileSync(path.join(profileDir, "CLAUDE.md"), "utf8")).toBe("account's own instructions");
    expect(readFileSync(path.join(profileDir, ".credentials.json"), "utf8")).toBe("account login SENTINEL-OWN-LOGIN");
    expect(readFileSync(path.join(profileDir, "projects", "mine", "s.jsonl"), "utf8")).toBe("account history");
    // System default is untouched, including what the links pointed at.
    expect(readFileSync(path.join(sourceDir, "skills", "review", "SKILL.md"), "utf8")).toBe("review skill");
    expect(readFileSync(path.join(sourceDir, "CLAUDE.md"), "utf8")).toBe("my instructions");
    expect(existsSync(path.join(sourceDir, "settings.json"))).toBe(true);
  });

  test("keeps a settings file the account changed when sharing is turned off", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan);
    write(path.join(profileDir, "settings.json"), JSON.stringify({ model: "edited in this account" }));
    removeSetupSharing(plan);
    expect(JSON.parse(readFileSync(path.join(profileDir, "settings.json"), "utf8"))).toEqual({ model: "edited in this account" });
    expect(existsSync(path.join(profileDir, "skills"))).toBe(false);
    expect(existsSync(path.join(profileDir, ".stave-shared-setup.json"))).toBe(false);
  });

  test("a tampered record cannot make it remove anything outside the plan", () => {
    const { sourceDir, profileDir } = folders();
    claudeSource(sourceDir);
    const plan = target("claude-code", sourceDir, profileDir);
    applySetupSharing(plan);
    write(path.join(profileDir, "projects", "mine", "s.jsonl"), "account history");
    const ledgerPath = path.join(profileDir, ".stave-shared-setup.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.links.projects = path.join(sourceDir, "projects");
    ledger.copies[".credentials.json"] = "0".repeat(64);
    writeFileSync(ledgerPath, JSON.stringify(ledger));
    removeSetupSharing(plan);
    expect(readFileSync(path.join(profileDir, "projects", "mine", "s.jsonl"), "utf8")).toBe("account history");
  });
});

describe("sharing into a managed Codex account", () => {
  test("links skills, prompts and instructions and leaves config, login and history behind", () => {
    const { sourceDir, profileDir } = folders();
    codexSource(sourceDir);
    const setup = applySetupSharing(target("codex", sourceDir, profileDir));
    expect(states(setup)).toEqual({ skills: "shared", prompts: "shared", "AGENTS.md": "shared" });
    expect(setup.entries.every((entry) => entry.action === "link")).toBe(true);
    expect(readdirSync(profileDir).sort()).toEqual([".stave-shared-setup.json", "AGENTS.md", "prompts", "skills"]);
    expect(allText(profileDir)).not.toContain("SENTINEL");
  });
});
