import { runCommandArgs } from "../utils/command";
import type { TrackerSourceAdapter } from "../../../src/lib/tracker-issues/source";
import { TrackerIssueDetailSchema, type TrackerIssueDetail } from "../../../src/lib/tracker-issues/types";
import { TrackerIssueError } from "./errors";

const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/([1-9]\d*)$/;
const ISSUE_REF = /^([\w.-]+\/[\w.-]+)#([1-9]\d*)$/;
const FIELDS = "number,title,url,state,assignees,labels,createdAt,updatedAt,closedAt";
const MAX_ROWS = 200;

/** Parse both search (REST) and issue view (GraphQL) JSON without trusting it. */
export function parseGitHubIssue(value: unknown): TrackerIssueDetail | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const match = typeof row.url === "string" ? ISSUE_URL.exec(row.url) : null;
  if (!match || row.isPullRequest === true || Number(match[2]) !== row.number) return null;
  const repository = match[1]!;
  const state = typeof row.state === "string" ? row.state.toLowerCase() : "";
  if (state !== "open" && state !== "closed") return null;
  const assignee = Array.isArray(row.assignees) ? row.assignees[0] : null;
  const parsed = TrackerIssueDetailSchema.safeParse({
    source: "github", ref: `${repository}#${row.number}`, key: `#${row.number}`,
    title: typeof row.title === "string" ? row.title.slice(0, 500) : "", url: row.url,
    status: { raw: state, category: state === "open" ? "todo" : "closed" },
    priority: { raw: null, level: "none" },
    assignee: assignee && typeof assignee.login === "string"
      ? { id: assignee.login, name: (typeof assignee.name === "string" && assignee.name.trim() ? assignee.name : assignee.login).slice(0, 200) } : null,
    labels: Array.isArray(row.labels) ? row.labels.flatMap((label: unknown) => {
      if (!label || typeof label !== "object" || !("name" in label) || typeof label.name !== "string" || !label.name.trim()) return [];
      return [{ name: label.name.slice(0, 100) }];
    }).slice(0, 20) : [],
    project: { id: repository, name: repository }, team: null,
    dueDate: null, effort: null, parentKey: null, subtasks: null, issueType: null, links: [],
    createdAt: row.createdAt, updatedAt: row.updatedAt, closedAt: row.closedAt ?? null,
    description: typeof row.body === "string" ? row.body.slice(0, 16_000) : "",
  });
  return parsed.success ? parsed.data : null;
}

export interface GitHubTrackerSourceDeps {
  enabled(): boolean;
  run?: (args: string[], signal?: AbortSignal) => Promise<{ ok: boolean; stdout: string }>;
}

/** Fixed argument arrays only; this adapter never mutates GitHub or handles tokens. */
export function createGitHubTrackerSource(deps: GitHubTrackerSourceDeps): TrackerSourceAdapter {
  const run = deps.run ?? ((commandArgs: string[], signal?: AbortSignal) => runCommandArgs({
    command: "gh", commandArgs, signal, timeoutMs: 20_000, maxOutputChars: 2_000_000,
    env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" },
  }));
  async function json(args: string[], signal: AbortSignal): Promise<unknown> {
    const result = await run(args, signal);
    if (signal.aborted) throw new TrackerIssueError("aborted");
    if (!result.ok) throw new TrackerIssueError("github_unavailable");
    try { return JSON.parse(result.stdout); }
    catch { throw new TrackerIssueError("invalid_response"); }
  }
  return {
    sourceId: "github", capabilities: { kickoffWriteBack: false, detail: true },
    async availability() {
      if (!deps.enabled()) return "disabled";
      try { return (await run(["auth", "status", "--hostname", "github.com"])).ok ? "ready" : "not_configured"; }
      catch { return "not_configured"; }
    },
    async listTasks({ signal }) {
      const rows = await json(["search", "issues", "--assignee=@me", "--sort=updated", "--order=desc",
        `--limit=${MAX_ROWS}`, "--json", `${FIELDS},isPullRequest`], signal);
      if (!Array.isArray(rows)) throw new TrackerIssueError("invalid_response");
      const tasks = rows.slice(0, MAX_ROWS).flatMap((row) => {
        const detail = parseGitHubIssue(row);
        if (!detail) return [];
        const { description: _description, ...task } = detail;
        return [task];
      });
      return { tasks, truncated: rows.length >= MAX_ROWS };
    },
    async getTask({ ref, signal }) {
      const match = ISSUE_REF.exec(ref);
      if (!match) throw new TrackerIssueError("invalid_reference");
      const row = await json(["issue", "view", match[2]!, "--repo", `github.com/${match[1]}`,
        "--json", `${FIELDS},body`], signal);
      const detail = parseGitHubIssue(row);
      if (!detail || detail.ref !== ref) throw new TrackerIssueError("invalid_response");
      return detail;
    },
  };
}
