import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tarsCheckCommandRules, tarsCheckScripts, tarsPackageManagerOf } from "../src/lib/tars/check-commands";
import { readTarsCheckCommandRules, tarsExecutionCheckoutOf, withTarsReviewerCheckCommands } from "../electron/host-service/tars-check-commands";
import { isReadOnlyDelegationPolicy, resolveDelegationPermissionPolicy } from "../src/lib/runs/delegation-policy";
import type { TarsResponsibility } from "../src/lib/tars/types";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const readOnly = (providerId: "claude-code" | "codex") => resolveDelegationPermissionPolicy({ providerId, access: "read-only" });

describe("Tars reviewer check commands (D6)", () => {
  test("only test, lint and typecheck scripts count, never ones that write, deploy or drive a browser", () => {
    expect(tarsCheckScripts({ test: "bun test", "test:e2e": "playwright test", lint: "oxlint", "lint:fix": "oxlint --fix", typecheck: "tsc",
      "check:i18n": "node x", "check:licenses": "node y", build: "vite build", "format:write": "x", release: "x", "test:watch": "x", check: 1 }))
      .toEqual(["check:i18n", "check:licenses", "lint", "test", "typecheck"]);
    expect(tarsCheckScripts(null)).toEqual([]);
  });

  test("rules are exact commands or commands with arguments after --, never a bare prefix", () => {
    const rules = tarsCheckCommandRules("bun", ["lint", "test"]);
    expect(rules).toEqual(["Bash(bun run lint)", "Bash(bun run lint -- :*)", "Bash(bun run test)", "Bash(bun run test -- :*)", "Bash(bun test)", "Bash(bun test :*)"]);
    expect(rules.some((rule) => /run lint:\*/.test(rule))).toBe(false);
    expect(tarsCheckCommandRules("npm", ["test"])).toContain("Bash(npm test)");
    expect(tarsCheckCommandRules("yarn", ["lint"])).toEqual(["Bash(yarn run lint)", "Bash(yarn run lint -- :*)"]);
  });

  test("the package manager follows packageManager, then the lockfile", () => {
    expect(tarsPackageManagerOf({ packageManagerField: "pnpm@9.1.0", lockfiles: ["bun.lock"] })).toBe("pnpm");
    expect(tarsPackageManagerOf({ lockfiles: ["bun.lockb"] })).toBe("bun");
    expect(tarsPackageManagerOf({ lockfiles: ["yarn.lock"] })).toBe("yarn");
    expect(tarsPackageManagerOf({ lockfiles: [] })).toBe("npm");
  });

  test("a checkout's rules come from its own package.json; none without one or with a broken one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tars-check-")); dirs.push(dir);
    expect(readTarsCheckCommandRules(dir)).toEqual([]);
    writeFileSync(path.join(dir, "package.json"), "{ broken");
    expect(readTarsCheckCommandRules(dir)).toEqual([]);
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: "tsc --noEmit", deploy: "x" } }));
    writeFileSync(path.join(dir, "bun.lock"), "");
    expect(readTarsCheckCommandRules(dir)).toEqual(["Bash(bun run typecheck)", "Bash(bun run typecheck -- :*)", "Bash(bun test)", "Bash(bun test :*)"]);
  });

  test("only a Claude read-only reviewer under a Tars lead gains the rules, and it stays provably read-only", () => {
    const rules = () => ["Bash(bun run test)"];
    const policy = readOnly("claude-code");
    const granted = withTarsReviewerCheckCommands(policy, { agentConfigId: "reviewer", checkout: "/tmp/checkout", readRules: rules });
    expect(granted.options.claudeAllowedTools).toContain("Bash(bun run test)");
    expect(granted.options.claudeAllowedTools).toContain("Read");
    expect(isReadOnlyDelegationPolicy("claude-code", granted)).toBe(true);
    expect(granted.options.claudeSandboxReadOnly).toBe(true);
    // Any other agent, parent, access or provider is left exactly as it was.
    expect(withTarsReviewerCheckCommands(policy, { agentConfigId: "researcher", checkout: "/tmp/checkout", readRules: rules })).toBe(policy);
    expect(withTarsReviewerCheckCommands(policy, { agentConfigId: "reviewer", checkout: null, readRules: rules })).toBe(policy);
    const inherit = resolveDelegationPermissionPolicy({ providerId: "claude-code" });
    expect(withTarsReviewerCheckCommands(inherit, { agentConfigId: "reviewer", checkout: "/tmp/checkout", readRules: rules })).toBe(inherit);
    const codex = readOnly("codex");
    expect(withTarsReviewerCheckCommands(codex, { agentConfigId: "reviewer", checkout: "/tmp/checkout", readRules: rules })).toBe(codex);
  });

  test("the checkout is found only for a Tars lead task with an execution workspace", () => {
    const row = { taskId: "lead", executionWorkspaceId: "exec", repositoryPath: "/repo" } as TarsResponsibility;
    const registry = [{ repositoryPath: "/repo", workspacePathById: { exec: "/repo/.stave/workspaces/exec" } }] as unknown as PersistenceRepositoryRegistryEntry[];
    expect(tarsExecutionCheckoutOf("lead", [row], registry)).toBe("/repo/.stave/workspaces/exec");
    expect(tarsExecutionCheckoutOf("someone-else", [row], registry)).toBeNull();
    expect(tarsExecutionCheckoutOf("lead", [{ ...row, executionWorkspaceId: null }], registry)).toBeNull();
    expect(tarsExecutionCheckoutOf("lead", [row], [])).toBeNull();
  });
});
