/**
 * Shared, short-lived reads of a repository's pull requests.
 *
 * Stack lookups (top bar and every Fleet card) and agent PR discovery all ask
 * the same questions about one repository: its default branch and owner, the
 * signed-in user, and its open or recently merged PRs. Workspaces are git
 * worktrees of one clone, so the cache key is the clone's common git
 * directory, and concurrent callers share one in-flight `gh` call. Entries
 * live for seconds, which keeps ten workspaces at a handful of API calls.
 */
import { z } from "zod";
import { StackPrSchema, type StackPr } from "../../src/lib/pull-request-stack";
import { runCommandArgs } from "../main/utils/command";
import { SCM_READ_TIMEOUT_MS, type ScmCommandRunner } from "./scm-runtime";

export const PULL_REQUEST_LIST_TTL_MS = 20_000;
const REPOSITORY_TTL_MS = 5 * 60_000;
export const OPEN_PULL_REQUEST_LIMIT = 100;
const MERGED_PULL_REQUEST_LIMIT = 50;
export const PULL_REQUEST_LIST_FIELDS = "number,title,url,headRefName,baseRefName,state,createdAt,mergedAt,isCrossRepository,headRepositoryOwner,author";

export interface RepositoryInfo { key: string; defaultBranch: string; owner: string; host: string; selector?: string }
export class PullRequestReadError extends Error {
  constructor(readonly code: "auth" | "read-failed" | "invalid-response", message: string) { super(message); }
}

const RepoViewSchema = z.object({
  defaultBranchRef: z.object({ name: z.string().min(1) }).passthrough(),
  owner: z.object({ login: z.string().min(1) }).passthrough(),
  url: z.string().url(),
}).passthrough();
const GhPrSchema = z.object({
  number: z.number(), title: z.string(), url: z.string(), headRefName: z.string(), baseRefName: z.string(),
  state: z.string(), createdAt: z.string(), mergedAt: z.string().nullable().optional(),
  isCrossRepository: z.boolean(), headRepositoryOwner: z.object({ login: z.string() }).passthrough().nullable(),
  author: z.object({ login: z.string() }).passthrough().nullable(),
}).passthrough();

interface Entry<T> { expires: number; value: Promise<T> }
const repositoryCache = new Map<string, Entry<RepositoryInfo>>();
const keyCache = new Map<string, Entry<string>>();
const viewerCache = new Map<string, Entry<string>>();
const listCache = new Map<string, Entry<StackPr[]>>();

/** Tests only: forget every cached read. */
export function resetPullRequestRepoCache() {
  repositoryCache.clear(); keyCache.clear(); viewerCache.clear(); listCache.clear();
}

function runner(run?: ScmCommandRunner): ScmCommandRunner {
  const command = run ?? runCommandArgs;
  return args => command({ ...args, timeoutMs: args.timeoutMs ?? SCM_READ_TIMEOUT_MS });
}

function cached<T>(cache: Map<string, Entry<T>>, key: string, ttl: number, now: number, load: () => Promise<T>) {
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = load();
  cache.set(key, { expires: now + ttl, value });
  // A failure is not worth remembering: the next caller asks again.
  value.catch(() => { if (cache.get(key)?.value === value) cache.delete(key); });
  return value;
}

function classify(stderr: string): PullRequestReadError {
  return new PullRequestReadError(/auth login|not logged|authentication|HTTP 401/i.test(stderr) ? "auth" : "read-failed", stderr.trim() || "gh failed");
}

async function gh(run: ScmCommandRunner, cwd: string, commandArgs: string[]) {
  const result = await run({ command: "gh", commandArgs, cwd });
  if (!result.ok) throw classify(result.stderr);
  try { return JSON.parse(result.stdout) as unknown; } catch { throw new PullRequestReadError("invalid-response", "gh returned invalid JSON"); }
}

/** The clone a worktree belongs to; local git only. */
async function repositoryKey(cwd: string, run: ScmCommandRunner, now: number) {
  return cached(keyCache, cwd, REPOSITORY_TTL_MS, now, async () => {
    const result = await run({ command: "git", commandArgs: ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd });
    if (!result.ok || !result.stdout.trim()) throw new PullRequestReadError("read-failed", result.stderr || "Not a git repository");
    return result.stdout.trim();
  });
}

export async function readRepositoryInfo(args: { cwd: string; selector?: string; run?: ScmCommandRunner; now?: number }): Promise<RepositoryInfo> {
  const run = runner(args.run);
  const now = args.now ?? Date.now();
  const key = await repositoryKey(args.cwd, run, now);
  return cached(repositoryCache, JSON.stringify([key, args.selector]), REPOSITORY_TTL_MS, now, async () => {
    const parsed = RepoViewSchema.safeParse(await gh(run, args.cwd, ["repo", "view", ...(args.selector ? [`https://${args.selector}`] : []), "--json", "defaultBranchRef,owner,url"]));
    if (!parsed.success) throw new PullRequestReadError("invalid-response", "Could not read the repository");
    const url = new URL(parsed.data.url);
    return { key: JSON.stringify([key, url.href.toLowerCase()]), defaultBranch: parsed.data.defaultBranchRef.name, owner: parsed.data.owner.login, host: url.host, selector: args.selector };
  });
}

function repositoryFlag(repository: RepositoryInfo) {
  return repository.selector ? ["--repo", repository.selector] : [];
}

/** The signed-in login for the repository's host. */
export async function readViewer(args: { cwd: string; repository: RepositoryInfo; run?: ScmCommandRunner; now?: number }) {
  const run = runner(args.run);
  return cached(viewerCache, args.repository.host, REPOSITORY_TTL_MS, args.now ?? Date.now(), async () => {
    const result = await run({ command: "gh", commandArgs: ["api", "--hostname", args.repository.host, "user", "--jq", ".login"], cwd: args.cwd });
    if (!result.ok || !result.stdout.trim()) throw classify(result.stderr);
    return result.stdout.trim();
  });
}

export function normalizePullRequest(raw: unknown, owner: string): StackPr | null {
  const parsed = GhPrSchema.safeParse(raw);
  if (!parsed.success) return null;
  const pr = parsed.data;
  const normalized = StackPrSchema.safeParse({
    number: pr.number, title: pr.title.slice(0, 1000), url: pr.url, headRefName: pr.headRefName, baseRefName: pr.baseRefName,
    state: pr.state, createdAt: pr.createdAt, mergedAt: pr.mergedAt ?? null, author: pr.author?.login ?? "",
    sameRepository: !pr.isCrossRepository && (pr.headRepositoryOwner?.login ?? "").toLowerCase() === owner.toLowerCase(),
  });
  return normalized.success ? normalized.data : null;
}

/** Open (or recently merged) PRs of the repository, one `gh` call per TTL. */
export async function readRepositoryPullRequests(args: { cwd: string; repository: RepositoryInfo; state: "open" | "merged"; run?: ScmCommandRunner; now?: number; fresh?: boolean }) {
  const run = runner(args.run);
  const now = args.now ?? Date.now();
  const key = `${args.repository.key}\0${args.state}`;
  if (args.fresh) listCache.delete(key);
  return cached(listCache, key, PULL_REQUEST_LIST_TTL_MS, now, async () => {
    const limit = args.state === "open" ? OPEN_PULL_REQUEST_LIMIT : MERGED_PULL_REQUEST_LIMIT;
    const rows = await gh(run, args.cwd, ["pr", "list", ...repositoryFlag(args.repository), "--state", args.state, "--limit", String(limit), "--json", PULL_REQUEST_LIST_FIELDS]);
    if (!Array.isArray(rows)) throw new PullRequestReadError("invalid-response", "gh returned a non-list");
    return rows.flatMap(row => normalizePullRequest(row, args.repository.owner) ?? []);
  });
}

/** PRs of one branch, for a branch the shared list did not reach. */
export async function readBranchPullRequests(args: { cwd: string; repository: RepositoryInfo; branch: string; run?: ScmCommandRunner }) {
  const rows = await gh(runner(args.run), args.cwd, ["pr", "list", "--head", args.branch, "--state", "all", "--limit", "5", "--json", PULL_REQUEST_LIST_FIELDS]);
  return Array.isArray(rows) ? rows.flatMap(row => normalizePullRequest(row, args.repository.owner) ?? []) : [];
}

/** One PR, read fresh: retargeting revalidates against current state. */
export async function readPullRequest(args: { cwd: string; repository: RepositoryInfo; number: number; run?: ScmCommandRunner }) {
  const raw = await gh(runner(args.run), args.cwd, ["pr", "view", String(args.number), ...repositoryFlag(args.repository), "--json", PULL_REQUEST_LIST_FIELDS]);
  const pr = normalizePullRequest(raw, args.repository.owner);
  if (!pr) throw new PullRequestReadError("invalid-response", `Could not read pull request #${args.number}`);
  return pr;
}

/** Drops cached PR lists after a write so the next read sees it. */
export function invalidateRepositoryPullRequests(repository: RepositoryInfo) {
  listCache.delete(`${repository.key}\0open`);
  listCache.delete(`${repository.key}\0merged`);
}

export async function readCurrentBranch(args: { cwd: string; run?: ScmCommandRunner }) {
  const result = await runner(args.run)({ command: "git", commandArgs: ["branch", "--show-current"], cwd: args.cwd });
  return result.ok ? result.stdout.trim() : "";
}
