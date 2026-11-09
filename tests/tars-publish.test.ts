import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createTarsPublisher, tarsPublishCommands, type TarsCommandResult, type TarsPublishPorts } from "../electron/host-service/tars-publish";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { tarsFollowUpRefusal } from "../electron/host-service/tars-follow-up-admission";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { TarsDecisionAction, TarsMessageOrigin } from "../src/lib/tars/conversation";
import { CreateTarsResponsibilityInputSchema, type TarsResponsibility } from "../src/lib/tars/types";
import {
  TarsPublishInputSchema, parseTarsCommitSubject, tarsDefaultCommitSubject, tarsPublishProposalRequestId, tarsPullRequestNumber, withTarsCommitType,
} from "../src/lib/tars/publication";
import { buildTarsPublicationBody } from "../src/lib/tars/publication-body";
import { projectTarsPublishProposals } from "../src/lib/tars/publish-model";
import { buildTarsOutputs } from "../src/lib/tars/outputs-model";

const NOW = "2026-11-05T00:00:00.000Z";
const HEAD = "feat/checkout-saved-card-3fa9c1";
const SHA = "f00ba12f00ba12f00ba12f00ba12f00ba12f00ba";
const URL = "https://github.com/example/web/pull/12";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

/** A scripted stand-in for git and gh in the execution workspace; it records every argument array. */
function fakeRepository() {
  const state = {
    branch: HEAD, dirty: [" M src/checkout/cards.ts", "?? src/checkout/cards.test.ts"], ahead: 0, remote: true as boolean,
    gh: "ok" as "ok" | "missing" | "signedOut" | "notGitHub", existing: null as { url: string; number: number } | null,
    fail: { commit: 0, push: 0, create: 0 }, sha: "1111111111111111111111111111111111111111",
    commits: new Set<string>(["1111111111111111111111111111111111111111"]),
  };
  const calls: Array<[string, string[]]> = [];
  const ok = (stdout = ""): TarsCommandResult => ({ ok: true, code: 0, stdout, stderr: "" });
  const no = (stderr: string): TarsCommandResult => ({ ok: false, code: 1, stdout: "", stderr });
  const run = async (command: "git" | "gh", args: readonly string[]): Promise<TarsCommandResult> => {
    calls.push([command, [...args]]);
    const line = args.join(" ");
    if (command === "gh") {
      if (state.gh === "missing") return no("spawn gh ENOENT");
      if (state.gh === "signedOut") return no("You are not logged into any GitHub hosts. Run gh auth login to authenticate.");
      if (args[0] === "repo") return state.gh === "notGitHub" ? no("none of the git remotes configured for this repository point to a known GitHub host")
        : ok(JSON.stringify({ nameWithOwner: "example/web", url: "https://github.com/example/web" }));
      if (args[0] === "pr" && args[1] === "list") return ok(JSON.stringify(state.existing ? [state.existing] : []));
      if (args[0] === "pr" && args[1] === "create") {
        if (state.fail.create > 0) { state.fail.create--; return no("GraphQL: was submitted too quickly"); }
        state.existing = { url: URL, number: 12 };
        return ok(`Creating draft pull request for ${HEAD} into main in example/web\n\n${URL}\n`);
      }
      return no(`unexpected gh ${line}`);
    }
    if (line === "rev-parse --abbrev-ref HEAD") return ok(`${state.branch}\n`);
    if (line === "status --porcelain=v1 -z --untracked-files=all") return ok(state.dirty.map((entry) => `${entry}\0`).join(""));
    if (line === "rev-parse --verify --quiet refs/heads/main") return ok("abc\n");
    if (line === "rev-list --count refs/heads/main..HEAD") return ok(`${state.ahead}\n`);
    if (line === "diff --name-only -z refs/heads/main...HEAD") return ok(state.ahead ? "src/checkout/cards.ts\0src/checkout/cards.test.ts\0" : "");
    if (line === "remote get-url origin") return state.remote ? ok("git@github.com:example/web.git\n") : no("error: No such remote 'origin'");
    if (line === "add -A") return ok();
    if (args[0] === "commit") {
      if (state.fail.commit > 0) { state.fail.commit--; return no("pre-commit hook failed"); }
      state.dirty = []; state.ahead += 1; state.sha = SHA; state.commits.add(SHA);
      return ok("[feat/checkout 1234567] feat: commit");
    }
    if (line === "rev-parse HEAD") return ok(`${state.sha}\n`);
    if (line.startsWith("rev-parse --verify --quiet --end-of-options ")) {
      const rev = args.at(-1)!.replace(/\^\{commit\}$/, "");
      return state.commits.has(rev) ? ok(`${rev}\n`) : no("");
    }
    if (args[0] === "push") {
      if (state.fail.push > 0) { state.fail.push--; return no("fatal: unable to access remote"); }
      return ok();
    }
    return no(`unexpected git ${line}`);
  };
  return { state, calls, run, commands: (name: string) => calls.filter(([command, args]) => command === "git" ? args[0] === name : `${args[0]} ${args[1]}` === name) };
}

function fixture(options: { workspace?: boolean; base?: string } = {}) {
  const database = new Database(":memory:"); databases.push(database);
  const responsibilities = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  const repo = fakeRepository();
  let clock = 0;
  const now = () => new Date(Date.parse(NOW) + (clock++) * 1_000).toISOString();
  const ports: TarsPublishPorts = {
    conversations, responsibilities, run: repo.run, now,
    resolveWorkspace: async () => options.workspace === false ? null : { path: "/tmp/exec-checkout", base: options.base ?? "main", repositoryName: "web" },
    readReport: async () => ({ state: "frozen", frozenAt: NOW, finalRevision: "f00ba12", outcome: "completed",
      criteria: [{ text: "Checkout shows the saved card first.", required: true, status: "met", source: { kind: "check", stageTitle: "Verify", name: "test", exitCode: 0, revision: "f00ba12", freshness: "current" } },
        { text: "The checkout tests pass.", required: true, status: "unmet", source: { kind: "none" } }],
      evidenceGroups: [{ stageId: "verify", stageTitle: "Verify", evidence: [{ evidence: { label: "bun test passed", kind: "check", command: "bun test", source: "stave", outcome: "succeeded", freshness: "current" },
        source: "stave", verified: true, stageTitle: "Verify", revision: "f00ba12", freshness: "current" }] }] }),
  };
  const publisher = createTarsPublisher(ports);
  /** Completed, verified work with an execution workspace, unless the patch says otherwise. */
  const completed = (patch: Partial<Pick<TarsResponsibility, "state" | "detail" | "detailCode" | "executionWorkspaceId">> = {}) => {
    const created = responsibilities.create({ requestId: `work-${clock++}`, title: "Show the saved card first at checkout", instruction: "Do the work.",
      acceptanceCriteria: ["Checkout shows the saved card first."], workspaceId: "source", repositoryPath: "/tmp/web", providerId: "codex", branchName: HEAD }, NOW);
    return responsibilities.patch(created.id, created.revision, { state: "completed", detail: null, taskId: `tars-${created.id}`,
      executionWorkspaceId: "exec-checkout", agentRunId: `run-${created.id}`, ...patch }, NOW);
  };
  const confirm = (row: TarsResponsibility, patch: Partial<{ requestId: string; expectedRevision: number; commitMessage: string; title: string }> = {}) =>
    publisher.publish({ requestId: patch.requestId ?? `publish-click:${clock++}`, responsibilityId: row.id, expectedRevision: patch.expectedRevision ?? row.revision,
      commitMessage: patch.commitMessage ?? "feat: show the saved card first at checkout", title: patch.title ?? "feat: show the saved card first at checkout", source: "click" });
  return { database, responsibilities, conversations, repo, publisher, completed, confirm, ports, now };
}

describe("Tars publish pins what it confirmed", () => {
  test("a retried push sends the commit the first attempt made, even when the branch moved since", async () => {
    const f = fixture(); const row = f.completed();
    f.repo.state.fail.push = 1;
    expect((await f.confirm(row)).record).toMatchObject({ status: "rejected" });
    expect(f.responsibilities.get(row.id)?.publication).toMatchObject({ state: "failed", failedStep: "push", commit: SHA });
    // Someone commits on the work's branch before the retry.
    const moved = "2222222222222222222222222222222222222222";
    f.repo.state.sha = moved; f.repo.state.commits.add(moved);
    const retried = f.responsibilities.get(row.id)!;
    expect((await f.confirm(retried)).record).toMatchObject({ status: "applied" });
    const pushes = f.repo.commands("push").map(([, args]) => args);
    expect(pushes.at(-1)).toEqual(["push", "origin", `${SHA}:refs/heads/${HEAD}`]);
    expect(pushes.flat().join(" ")).not.toContain(moved);
  });

  test("a retry whose saved commit is gone refuses instead of pushing something else", async () => {
    const f = fixture(); const row = f.completed();
    f.repo.state.fail.push = 1;
    await f.confirm(row);
    f.repo.state.commits.delete(SHA);
    expect((await f.confirm(f.responsibilities.get(row.id)!)).record).toMatchObject({ status: "rejected", reason: "publishFailed" });
    expect(f.repo.commands("push")).toHaveLength(1);
  });

  test("work whose rule-following branch fell back to tars/<id> still publishes, from that branch", async () => {
    const f = fixture(); const row = f.completed();
    f.repo.state.branch = `tars/${row.id}`;
    expect((await f.confirm(row)).record).toMatchObject({ status: "applied" });
    expect(f.repo.commands("push").map(([, args]) => args)).toEqual([["push", "origin", `${SHA}:refs/heads/tars/${row.id}`]]);
  });
});

describe("Tars publish admission", () => {
  test("refuses work that has not completed, that Stave did not verify, or that changed since the card, without running a command", async () => {
    const f = fixture();
    const running = f.completed({ state: "running" });
    expect((await f.confirm(running)).record).toMatchObject({ status: "rejected", reason: "notCompleted" });
    const accepted = f.completed({ detail: "Accepted without a check.", detailCode: "acceptedWithoutVerification" });
    expect((await f.confirm(accepted)).record).toMatchObject({ status: "rejected", reason: "notVerified" });
    const row = f.completed();
    expect((await f.confirm(row, { expectedRevision: row.revision - 1 })).record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.repo.calls).toEqual([]);
    expect(f.responsibilities.get(row.id)?.publication).toBeUndefined();
  });

  test("refuses when the workspace is gone, has no changes, or sits on the wrong branch", async () => {
    const gone = fixture({ workspace: false });
    expect((await gone.confirm(gone.completed())).record).toMatchObject({ status: "rejected", reason: "noWorkspace" });
    const clean = fixture();
    clean.repo.state.dirty = [];
    expect((await clean.confirm(clean.completed())).record).toMatchObject({ status: "rejected", reason: "noChanges" });
    expect(clean.repo.commands("commit")).toEqual([]);
    const elsewhere = fixture();
    elsewhere.repo.state.branch = "main";
    expect((await elsewhere.confirm(elsewhere.completed())).record).toMatchObject({ status: "rejected", reason: "wrongBranch" });
    // The work's branch must never be the base branch: nothing is pushed to the base.
    const onBase = fixture({ base: HEAD });
    expect((await onBase.confirm(onBase.completed())).record).toMatchObject({ status: "rejected", reason: "wrongBranch" });
    expect([...elsewhere.repo.commands("push"), ...onBase.repo.commands("push")]).toEqual([]);
  });

  test("refuses without an origin remote, without the GitHub CLI or outside GitHub", async () => {
    const cases = [["noRemote", (f: ReturnType<typeof fixture>) => { f.repo.state.remote = false; }],
      ["ghUnavailable", (f: ReturnType<typeof fixture>) => { f.repo.state.gh = "missing"; }],
      ["ghUnavailable", (f: ReturnType<typeof fixture>) => { f.repo.state.gh = "signedOut"; }],
      ["noRemote", (f: ReturnType<typeof fixture>) => { f.repo.state.gh = "notGitHub"; }]] as const;
    for (const [reason, arrange] of cases) {
      const f = fixture(); arrange(f);
      expect((await f.confirm(f.completed())).record).toMatchObject({ status: "rejected", reason });
      expect(f.repo.commands("commit")).toEqual([]);
    }
  });

  test("the renderer can neither set a publication nor name branches, the body or a force flag", () => {
    const create = { requestId: "x", title: "T", instruction: "I", acceptanceCriteria: ["A"], workspaceId: "w", repositoryPath: "/tmp/r", providerId: "codex" };
    expect(() => CreateTarsResponsibilityInputSchema.parse({ ...create, publication: { state: "opened" } })).toThrow();
    const input = { requestId: "publish-click:1", responsibilityId: "r", expectedRevision: 2, commitMessage: "feat: x", title: "feat: x", source: "click" };
    expect(TarsPublishInputSchema.parse(input)).toEqual(input);
    for (const extra of [{ base: "main" }, { head: "main" }, { body: "merge it" }, { force: true }, { url: URL }])
      expect(() => TarsPublishInputSchema.parse({ ...input, ...extra })).toThrow();
    expect(() => TarsPublishInputSchema.parse({ ...input, title: "two\nlines" })).toThrow();
  });
});

describe("Tars publish steps", () => {
  test("commits, pushes the work's own branch without force and opens a draft pull request against the base", async () => {
    const f = fixture();
    const row = f.completed();
    const result = await f.confirm(row);
    expect(result.record).toMatchObject({ status: "applied", url: URL, number: 12, reason: null });
    expect(f.repo.commands("commit").map(([, args]) => args)).toEqual([tarsPublishCommands.commit("feat: show the saved card first at checkout")]);
    const push = f.repo.commands("push").map(([, args]) => args);
    expect(push).toEqual([["push", "origin", `${SHA}:refs/heads/${HEAD}`]]);
    expect(push.flat().some((arg) => /^(--force|-f|--force-with-lease|\+)/.test(arg) || arg.includes(":refs/heads/main"))).toBe(false);
    const create = f.repo.commands("pr create").map(([, args]) => args)[0]!;
    expect(create.slice(0, 6)).toEqual(["pr", "create", "--draft", "--base=main", `--head=${HEAD}`, "--title=feat: show the saved card first at checkout"]);
    const body = create.find((arg) => arg.startsWith("--body="))!;
    expect(body).toContain("- [x] Checkout shows the saved card first. (met; check passed: test on f00ba12)");
    expect(body).toContain("- [ ] The checkout tests pass. (unmet)");
    expect(body).toContain("bun test passed");
    // Nothing merges, deploys or edits the pull request beyond creating it.
    expect(f.repo.calls.some(([command, args]) => command === "gh" && /merge|ready|edit/.test(args[1] ?? ""))).toBe(false);
    expect(f.responsibilities.get(row.id)?.publication).toMatchObject({ state: "opened", commit: SHA, branch: HEAD, base: "main", url: URL, number: 12, failedStep: null });
    // A repeated request id returns the same outcome and runs nothing again.
    const before = f.repo.calls.length;
    expect((await f.publisher.publish({ requestId: result.record.requestId, responsibilityId: row.id, expectedRevision: row.revision,
      commitMessage: result.record.commitMessage, title: result.record.title, source: "click" })).record).toEqual(result.record);
    expect(f.repo.calls.length).toBe(before);
    // An open pull request is not published twice.
    const again = f.responsibilities.get(row.id)!;
    expect((await f.confirm(again)).record).toMatchObject({ status: "rejected", reason: "alreadyPublished" });
  });

  test("records an existing pull request for the branch instead of opening another", async () => {
    const f = fixture();
    f.repo.state.existing = { url: "https://github.com/example/web/pull/7", number: 7 };
    const row = f.completed();
    expect((await f.confirm(row)).record).toMatchObject({ status: "applied", url: "https://github.com/example/web/pull/7", number: 7, existing: true });
    expect(f.repo.commands("pr create")).toEqual([]);
    expect(f.responsibilities.get(row.id)?.publication).toMatchObject({ state: "opened", existing: true, number: 7 });
  });

  test.each([["commit", { commit: 1 }, 2, 1, 1], ["push", { push: 1 }, 1, 2, 1], ["pr", { create: 1 }, 1, 1, 2]] as const)(
    "a failed %s step is saved and a retry resumes there without repeating finished steps", async (step, fail, commits, pushes, creates) => {
      const f = fixture();
      Object.assign(f.repo.state.fail, fail);
      const row = f.completed();
      const first = await f.confirm(row);
      expect(first.record).toMatchObject({ status: "rejected", reason: "publishFailed" });
      const failed = f.responsibilities.get(row.id)!;
      expect(failed.publication).toMatchObject({ state: "failed", failedStep: step, reason: "publishFailed" });
      expect(failed.publication?.error).toBeTruthy();
      const retried = await f.confirm(failed);
      expect(retried.record).toMatchObject({ status: "applied", url: URL });
      expect(f.repo.commands("commit")).toHaveLength(commits);
      expect(f.repo.commands("push")).toHaveLength(pushes);
      expect(f.repo.commands("pr create")).toHaveLength(creates);
      expect(f.responsibilities.get(row.id)?.publication).toMatchObject({ state: "opened", commit: SHA, failedStep: null, error: null });
    });

  test("a second confirmation while one runs is refused, and a restart turns an unfinished publication into a retryable failure", async () => {
    const f = fixture();
    const row = f.completed();
    const [first, second] = await Promise.all([f.confirm(row), f.confirm(row)]);
    expect([first.record.status, second.record.status].sort()).toEqual(["applied", "rejected"]);
    expect([first.record, second.record].find((record) => record.status === "rejected")?.reason).toBe("inProgress");

    const g = fixture();
    const work = g.completed();
    const record = g.conversations.recordPublish({ requestId: "publish-click:lost", responsibilityId: work.id, expectedRevision: work.revision,
      commitMessage: "feat: x", title: "feat: x", source: "click" }, null, NOW);
    g.responsibilities.patch(work.id, work.revision, { publication: { state: "pushed", failedStep: null, commit: SHA, branch: HEAD, base: "main",
      commitMessage: "feat: x", title: "feat: x", url: null, number: null, error: null, reason: null, updatedAt: NOW } }, NOW);
    g.publisher.recover();
    expect(g.responsibilities.get(work.id)?.publication).toMatchObject({ state: "failed", failedStep: "pr", reason: "publishFailed" });
    expect(g.conversations.getPublish(record.requestId)).toMatchObject({ status: "rejected", reason: "publishFailed" });
    // The retry continues at the pull request: no new commit, no new push.
    const retried = await g.confirm(g.responsibilities.get(work.id)!);
    expect(retried.record.status).toBe("applied");
    expect([g.repo.commands("commit").length, g.repo.commands("push").length, g.repo.commands("pr create").length]).toEqual([0, 0, 1]);
  });

  test("retrying the same request after a lost answer continues its own saved steps instead of reading as stale", async () => {
    const f = fixture();
    const row = f.completed();
    const input = { requestId: "publish-click:lock", responsibilityId: row.id, expectedRevision: row.revision, commitMessage: "feat: x", title: "feat: x", source: "click" as const };
    f.conversations.recordPublish(input, null, NOW);
    // Its commit was saved before a lock wait failed the request; nothing is running now.
    f.responsibilities.patch(row.id, row.revision, { publication: { state: "committed", failedStep: null, commit: SHA, branch: HEAD, base: "main",
      commitMessage: "feat: x", title: "feat: x", url: null, number: null, error: null, reason: null, updatedAt: "2026-11-05T00:00:05.000Z" } }, NOW);
    Object.assign(f.repo.state, { dirty: [], ahead: 1, sha: SHA }); f.repo.state.commits.add(SHA);
    expect((await f.publisher.publish(input)).record).toMatchObject({ status: "applied", url: URL });
    expect([f.repo.commands("commit").length, f.repo.commands("push").length]).toEqual([0, 1]);
    // A different, newer request at the old revision is still stale.
    expect((await f.confirm(row, { expectedRevision: row.revision })).record.reason).toBe("stale");
  });

  test("the preview reads what the card shows and changes nothing", async () => {
    const f = fixture();
    const row = f.completed();
    const preview = await f.publisher.preview({ responsibilityId: row.id });
    expect(preview).toMatchObject({ responsibilityId: row.id, revision: row.revision, reason: null, repository: "example/web", base: "main", head: HEAD, changedFiles: 2 });
    expect(preview.body).toContain("## Acceptance criteria");
    expect(f.repo.calls.every(([command, args]) => command === "gh" ? args[0] === "repo" : !["add", "commit", "push"].includes(args[0]!))).toBe(true);
    expect(f.responsibilities.get(row.id)!.revision).toBe(row.revision);
    const running = f.completed({ state: "running" });
    expect((await f.publisher.preview({ responsibilityId: running.id })).reason).toBe("notCompleted");
  });
});

describe("Tars publish from words", () => {
  let sequence = 0;
  function words(f: ReturnType<typeof fixture>, actions: TarsDecisionAction[], origin?: TarsMessageOrigin) {
    f.conversations.configure({ providerId: "codex", model: "m", maxTurns: 5 });
    const queued = f.conversations.create({ requestId: `${origin ? "followup" : "message"}-${sequence++}`, text: "Open a draft PR for the checkout work." }, NOW, 32, origin);
    const claimed = f.conversations.claim(queued.id, queued.revision, NOW);
    const message = f.conversations.answer(claimed.id, claimed.revision, { reply: "Confirm the card to publish.", actions }, NOW);
    const ports: TarsDecisionPorts = { conversations: f.conversations, responsibilities: f.responsibilities, readRegistry: () => [], requestTick: () => {},
      control: () => { throw new Error("no control"); }, now: () => NOW };
    return { message, apply: () => applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports) };
  }

  test("a publish proposal waits as proposed; only its card's confirmation publishes, and it settles the proposal", async () => {
    const f = fixture();
    const row = f.completed();
    const { message, apply } = words(f, [{ kind: "publish", responsibilityId: row.id, expectedRevision: row.revision }]);
    const [receipt] = await apply();
    expect(receipt).toMatchObject({ status: "proposed", responsibilityId: null });
    expect(f.repo.calls).toEqual([]);
    expect(projectTarsPublishProposals({ receipts: [receipt!], publications: [], responsibilities: [row] })[0]).toMatchObject({ state: "waiting", checked: true });
    const requestId = tarsPublishProposalRequestId(message.id, 0);
    const result = await f.confirm(row, { requestId });
    expect(result.record).toMatchObject({ status: "applied", proposal: { messageId: message.id, actionIndex: 0 } });
    expect(f.conversations.getReceipt(message.id, 0)).toMatchObject({ status: "applied", responsibilityId: row.id });
  });

  test("a confirmation must repeat its proposal exactly", async () => {
    const f = fixture();
    const row = f.completed();
    const other = f.completed();
    const { message, apply } = words(f, [{ kind: "publish", responsibilityId: row.id, expectedRevision: row.revision }]);
    await apply();
    const requestId = tarsPublishProposalRequestId(message.id, 0);
    await expect(f.confirm(other, { requestId })).rejects.toThrow("does not match its proposal");
    await expect(f.confirm(row, { requestId, expectedRevision: row.revision + 1 })).rejects.toThrow("does not match its proposal");
    await expect(f.confirm(row, { requestId: tarsPublishProposalRequestId(message.id, 1) })).rejects.toThrow("does not match its proposal");
    expect(f.repo.calls).toEqual([]);
  });

  test("a proposal for work that cannot publish is refused when it is made, with its reason", async () => {
    const f = fixture();
    const running = f.completed({ state: "running" });
    const row = f.completed();
    const opened = f.responsibilities.patch(row.id, row.revision, { publication: { state: "opened", failedStep: null, commit: SHA, branch: HEAD, base: "main",
      commitMessage: "feat: x", title: "feat: x", url: URL, number: 12, error: null, reason: null, updatedAt: NOW } }, NOW);
    const { apply } = words(f, [{ kind: "publish", responsibilityId: running.id, expectedRevision: running.revision }]);
    expect((await apply())[0]).toMatchObject({ status: "rejected", reason: "notCompleted" });
    const later = words(f, [{ kind: "publish", responsibilityId: opened.id, expectedRevision: opened.revision }]);
    expect((await later.apply())[0]).toMatchObject({ status: "rejected", reason: "alreadyPublished" });
    expect(f.repo.calls).toEqual([]);
  });

  test("an automatic follow-up cannot propose publishing", async () => {
    const f = fixture();
    const row = f.completed();
    const origin: TarsMessageOrigin = { kind: "followUp", eventKey: `${row.id}:completed:2`, responsibilityId: row.id, reason: "blocked", observedRevision: row.revision, summary: "x" };
    const action: TarsDecisionAction = { kind: "publish", responsibilityId: row.id, expectedRevision: row.revision };
    expect(tarsFollowUpRefusal(action, origin, f.responsibilities)).toContain("cannot propose publishing");
    const { apply } = words(f, [action], origin);
    const [receipt] = await apply();
    expect(receipt).toMatchObject({ status: "rejected", reason: "notByFollowUp" });
  });

  test("the planner may return one publish action, never two", () => {
    const action = { kind: "publish", responsibilityId: "r", expectedRevision: 3 };
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Confirm the card.", actions: [action] })).actions).toEqual([action]);
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [action, action] }))).toThrow();
    expect(() => parseTarsDecisionOutput(JSON.stringify({ reply: "x", actions: [{ ...action, base: "main" }] }))).toThrow();
  });
});

describe("Tars publish words and results", () => {
  test("a Conventional Commit subject from the title in lower case, with a type the user can change", () => {
    expect(tarsDefaultCommitSubject("Show the saved card first at checkout")).toBe("feat: show the saved card first at checkout");
    expect(tarsDefaultCommitSubject("Fix the flaky DatePicker test.")).toBe("fix: the flaky DatePicker test");
    expect(tarsDefaultCommitSubject("Add a Slugify helper for the API")).toBe("feat: add a slugify helper for the API");
    expect(tarsDefaultCommitSubject("refactor(store): split selectors")).toBe("refactor(store): split selectors");
    expect(withTarsCommitType("feat(ui)!: drop the old card", "fix")).toBe("fix(ui)!: drop the old card");
    expect(withTarsCommitType("drop the old card", "chore")).toBe("chore: drop the old card");
    expect(parseTarsCommitSubject("docs: explain publishing")).toEqual({ type: "docs", scope: null, breaking: false, subject: "explain publishing" });
    expect(tarsPullRequestNumber(URL)).toBe(12);
  });

  test("the body says what was asked, each criterion's status and the evidence, and never asks to merge", () => {
    const body = buildTarsPublicationBody({ title: "Use `code` *here*", report: null });
    expect(body).toContain("Use \\`code\\` \\*here\\*");
    expect(body).toContain("No verification evidence was recorded");
    expect(body).toContain("It was not merged or deployed.");
  });

  test("an opened pull request is an output of its work", () => {
    const row = { id: "r", title: "Checkout", updatedAt: NOW, agentRunId: null, publication: { state: "opened", url: URL, number: 12 } } as unknown as TarsResponsibility;
    expect(buildTarsOutputs({ responsibilities: [row], runs: {} })).toEqual([{ kind: "pullRequest", responsibilityId: "r", title: "Checkout", url: URL, number: 12 }]);
  });
});
