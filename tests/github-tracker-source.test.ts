import { describe, expect, test } from "bun:test";
import { createGitHubTrackerSource, parseGitHubIssue } from "../electron/main/tracker-issues/github-source";
import { TrackerIssueDetailSchema, TrackerIssueRefArgsSchema } from "../src/lib/tracker-issues/types";
import { normalizeTrackerIssuesSettings } from "../src/lib/tracker-issues/settings";
import { findTrackerIssueMappedRepositoryPath, resolveTrackerIssueScopeKey } from "../src/lib/tracker-issues/kickoff-target";

const issue = { number: 42, title: "Fix the launch flow", url: "https://github.com/team/project/issues/42",
  state: "open", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-12T00:00:00Z", closedAt: null,
  assignees: [{ login: "reader", name: "Reader" }], labels: [{ name: "bug" }], body: "Expected launch behavior." };

describe("GitHub tracker", () => {
  test("normalizes search and view JSON into the shared source contract", () => {
    const row = parseGitHubIssue(issue)!;
    expect(TrackerIssueDetailSchema.parse(row)).toMatchObject({ source: "github", ref: "team/project#42",
      key: "#42", project: { id: "team/project", name: "team/project" }, status: { category: "todo" }, description: issue.body });
    expect(parseGitHubIssue({ ...issue, state: "CLOSED", assignees: [{ login: "reader", name: 123 }], body: "a".repeat(20_000) }))
      .toMatchObject({ status: { category: "closed" }, assignee: { name: "reader" }, description: "a".repeat(16_000) });
    expect(TrackerIssueRefArgsSchema.parse({ source: row.source, taskRef: row.ref }).source).toBe("github");
  });
  test("keeps valid long repository names within the shared ref and project contracts", () => {
    const repository = `${"o".repeat(39)}/${"r".repeat(100)}`;
    const row = parseGitHubIssue({ ...issue, url: `https://github.com/${repository}/issues/42` })!;
    expect(row?.ref).toBe(`${repository}#42`);
    expect(TrackerIssueRefArgsSchema.parse({ source: row.source, taskRef: row.ref }).taskRef).toBe(row.ref);
  });
  test.each([null, {}, { ...issue, number: 0 }, { ...issue, number: 3 }, { ...issue, isPullRequest: true },
    { ...issue, url: "https://github.com.evil.test/team/project/issues/42" }, { ...issue, url: "https://github.com/team/project/pull/42" },
    { ...issue, state: "unknown" }, { ...issue, createdAt: "bad" }])("drops malformed or foreign rows: %j", (row) => {
    expect(parseGitHubIssue(row)).toBeNull();
  });
  test("uses read-only argument arrays scoped to the authenticated assignee", async () => {
    const calls: string[][] = [];
    const source = createGitHubTrackerSource({ enabled: () => true, run: async (args) => {
      calls.push(args);
      return { ok: true, stdout: JSON.stringify(args[0] === "search" ? [issue, {}] : issue) };
    } });
    expect(source.capabilities).toEqual({ kickoffWriteBack: false, detail: true });
    expect(await source.availability()).toBe("ready");
    const signal = new AbortController().signal;
    expect(await source.listTasks({ signal })).toMatchObject({ tasks: [{ source: "github" }], truncated: false });
    expect(calls[1]).toEqual(["search", "issues", "--assignee=@me", "--sort=updated", "--order=desc", "--limit=200",
      "--json", "number,title,url,state,assignees,labels,createdAt,updatedAt,closedAt,isPullRequest"]);
    expect(await source.getTask({ ref: "team/project#42", signal })).toMatchObject({ description: issue.body });
    expect(calls[2]?.slice(0, 5)).toEqual(["issue", "view", "42", "--repo", "github.com/team/project"]);
    const count = calls.length;
    await expect(source.getTask({ ref: "--repo=other", signal })).rejects.toMatchObject({ code: "invalid_reference" });
    expect(calls).toHaveLength(count);
  });
  test("bounds list rows, signals truncation and rejects unreadable responses without leaking output", async () => {
    const signal = new AbortController().signal;
    const large = createGitHubTrackerSource({ enabled: () => true, run: async () => ({ ok: true, stdout: JSON.stringify(Array(201).fill(issue)) }) });
    const result = await large.listTasks({ signal });
    expect(result.tasks).toHaveLength(200);
    expect(result.truncated).toBe(true);
    for (const stdout of ["credential must not leak", "{}"] ) {
      const source = createGitHubTrackerSource({ enabled: () => true, run: async () => ({ ok: true, stdout }) });
      await expect(source.listTasks({ signal })).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
  test("off means no CLI invocation; missing auth is setup and aborted reads fail", async () => {
    let calls = 0;
    const run = async () => { calls++; return { ok: false, stdout: "private diagnostic" }; };
    expect(await createGitHubTrackerSource({ enabled: () => false, run }).availability()).toBe("disabled");
    expect(calls).toBe(0);
    const source = createGitHubTrackerSource({ enabled: () => true, run });
    expect(await source.availability()).toBe("not_configured");
    const signal = AbortSignal.abort();
    await expect(source.listTasks({ signal })).rejects.toMatchObject({ code: "aborted" });
    await expect(source.listTasks({ signal: new AbortController().signal })).rejects.toMatchObject({ code: "github_unavailable" });
  });
  test("preserves legacy source settings and uses only registered source mappings", () => {
    const old = normalizeTrackerIssuesSettings({ sourceEnabled: { crane: false } });
    expect(old.sourceEnabled).toEqual({ crane: false, github: false });
    expect(old.githubMappings).toEqual([]);
    const task = parseGitHubIssue(issue)!;
    expect(resolveTrackerIssueScopeKey(task)).toBe("team/project");
    const settings = { craneMappings: [], jiraMappings: [], githubMappings: [{ repository: "TEAM/PROJECT", staveProjectPath: "/tmp/project" }] };
    expect(findTrackerIssueMappedRepositoryPath({ task, settings, registeredRepositoryPaths: ["/tmp/project"] })).toBe("/tmp/project");
    expect(findTrackerIssueMappedRepositoryPath({ task, settings, registeredRepositoryPaths: [] })).toBeNull();
  });
});
