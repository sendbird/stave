/**
 * An executable `gh` stand-in for host tests. State lives in a JSON file the
 * script reads on every call, every invocation is appended to a log, and git
 * stays real: tests run it against temporary repositories.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCommandArgs } from "../../electron/main/utils/command";
import type { ScmCommandRunner } from "../../electron/host-service/scm-runtime";

export interface FakeGhPr {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  createdAt: string;
  mergedAt: string | null;
  isCrossRepository: boolean;
  headRepositoryOwner: { id: string; login: string };
  author: { id: string; login: string; is_bot: boolean };
  isDraft: boolean;
  headRefOid: string;
  mergeable: string;
  mergeStateStatus: string;
  statusCheckRollup: unknown[];
}

export interface FakeGhState {
  repo: { owner: string; name: string; defaultBranch: string };
  viewer: string;
  prs: FakeGhPr[];
  /** PR numbers whose `gh pr edit` fails. */
  failEdit?: number[];
  /** PR numbers whose `gh pr update-branch` reports a merge conflict. */
  conflict?: number[];
}

export function fakePr(overrides: Partial<FakeGhPr> & { number: number; headRefName: string; baseRefName: string }, state?: Pick<FakeGhState, "repo" | "viewer">): FakeGhPr {
  const owner = state?.repo.owner ?? "example";
  const login = overrides.author?.login ?? state?.viewer ?? "me";
  return {
    title: `Change ${overrides.number}`,
    url: `https://github.com/${owner}/${state?.repo.name ?? "repo"}/pull/${overrides.number}`,
    state: "OPEN",
    createdAt: "2026-11-17T00:00:00Z",
    mergedAt: null,
    isCrossRepository: false,
    headRepositoryOwner: { id: "owner", login: owner },
    isDraft: false,
    headRefOid: "abc",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    statusCheckRollup: [],
    ...overrides,
    author: { id: login, login, is_bot: false },
  };
}

const SCRIPT = String.raw`
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const [statePath, logPath] = [process.env.FAKE_GH_STATE, process.env.FAKE_GH_LOG];
const args = process.argv.slice(2);
fs.appendFileSync(logPath, JSON.stringify(args) + "\n");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const flag = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const pick = (value) => {
  const fields = flag("--json");
  if (!fields) return value;
  const one = (pr) => Object.fromEntries(fields.split(",").map((field) => [field, pr[field]]));
  return Array.isArray(value) ? value.map(one) : one(value);
};
const out = (value) => process.stdout.write(JSON.stringify(value));
const fail = (message) => { process.stderr.write(message); process.exit(1); };
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
if (args[0] === "auth") process.exit(0);
if (args[0] === "api" && args.includes("user")) {
  process.stdout.write(args.includes("--jq") ? state.viewer + "\n" : JSON.stringify({ login: state.viewer }));
  process.exit(0);
}
if (args[0] === "api" && args[1] === "graphql") { out({ data: { repository: { pullRequest: { reviews: { nodes: [] } } } } }); process.exit(0); }
if (args[0] === "repo" && args[1] === "view") {
  const repo = { defaultBranchRef: { name: state.repo.defaultBranch }, owner: { id: "owner", login: state.repo.owner }, name: state.repo.name, nameWithOwner: state.repo.owner + "/" + state.repo.name, url: "https://github.com/" + state.repo.owner + "/" + state.repo.name };
  const fields = flag("--json");
  out(fields ? Object.fromEntries(fields.split(",").map((field) => [field, repo[field]])) : repo);
  process.exit(0);
}
if (args[0] !== "pr") fail("unexpected fake command " + args.join(" "));
const target = args[2] && !args[2].startsWith("-") ? args[2] : undefined;
const find = () => {
  if (target && /^\d+$/.test(target)) return state.prs.find((pr) => pr.number === Number(target));
  const branch = target ?? execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  const matches = state.prs.filter((pr) => pr.headRefName === branch);
  return matches.find((pr) => pr.state === "OPEN") ?? matches[0];
};
switch (args[1]) {
  case "view": {
    const pr = find();
    if (!pr) fail("no pull requests found for branch");
    out(pick(pr));
    break;
  }
  case "list": {
    const wanted = (flag("--state") ?? "open").toUpperCase();
    const head = flag("--head");
    const base = flag("--base");
    const limit = Number(flag("--limit") ?? "30");
    const rows = state.prs
      .filter((pr) => wanted === "ALL" || pr.state === wanted)
      .filter((pr) => head === undefined || pr.headRefName === head)
      .filter((pr) => base === undefined || pr.baseRefName === base)
      .sort((a, b) => b.number - a.number)
      .slice(0, limit);
    out(pick(rows));
    break;
  }
  case "edit": {
    const pr = find();
    if (!pr) fail("no pull requests found");
    if ((state.failEdit ?? []).includes(pr.number)) fail("GraphQL: could not edit pull request");
    pr.baseRefName = flag("--base");
    save();
    break;
  }
  case "update-branch": {
    const pr = find();
    if (!pr) fail("no pull requests found");
    if ((state.conflict ?? []).includes(pr.number)) fail("merge conflict between base and head");
    break;
  }
  default:
    fail("unexpected fake command " + args.join(" "));
}
`;

export function createFakeGh(directory: string, initial: FakeGhState) {
  const bin = join(directory, "fake-gh-bin");
  if (!existsSync(bin)) mkdirSync(bin, { recursive: true });
  const statePath = join(bin, "state.json");
  const logPath = join(bin, "calls.jsonl");
  const executable = join(bin, "gh");
  writeFileSync(executable, `#!${process.execPath}\n${SCRIPT}`);
  chmodSync(executable, 0o755);
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(logPath, "");
  const env = { FAKE_GH_STATE: statePath, FAKE_GH_LOG: logPath };
  const run: ScmCommandRunner = (request) => runCommandArgs({
    ...request,
    ...(request.command === "gh" ? { command: executable } : {}),
    env: { ...process.env, ...request.env, ...env },
  });
  return {
    run,
    executable,
    env,
    state: () => JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState,
    update: (change: (state: FakeGhState) => void) => {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState;
      change(state);
      writeFileSync(statePath, JSON.stringify(state));
    },
    calls: () => readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[]),
    resetCalls: () => writeFileSync(logPath, ""),
  };
}

export function gitRepository(root: string) {
  const git = (cwd: string, ...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "test@example.test");
  git(root, "config", "user.name", "Test");
  writeFileSync(join(root, "file"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "test: base");
  return {
    git,
    worktree(name: string, branch: string) {
      const path = join(root, "..", `${name}-${Math.random().toString(36).slice(2, 8)}`);
      git(root, "worktree", "add", "-b", branch, path);
      return path;
    },
  };
}
