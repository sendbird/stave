import {
  tarsCanUpdatePublication, isTarsPublicationUnfinished, parseTarsPublishProposalRequestId, tarsPublicationResumeStep, tarsPublishHeadBranch, tarsPullRequestNumber,
  TarsPublishInputSchema, TarsPublishPreviewInputSchema, TarsPublishPreviewSchema,
  type TarsPublication, type TarsPublicationStep, type TarsPublishPreview, type TarsPublishReason, type TarsPublishRecord, type TarsPublishResult,
} from "../../src/lib/tars/publication";
import { readWorkspaceRevision } from "./supervision/workspace-revision";
import { revisionsMatch, type WorkspaceRevision } from "../../src/lib/agent-runs/verification-contract";
import { buildTarsPublicationBody } from "../../src/lib/tars/publication-body";
import type { TarsReportModel } from "../../src/lib/tars/report-model";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import { isTarsStorageBusy, TarsStorageBusyError, type TarsConversationStore, type TarsProposalRef } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";

/**
 * The host's one publish path. A word proposal's confirmation and a click on
 * a card opened from the tray or the report both arrive here, are recorded by
 * request id, and are admitted against the saved responsibility and the
 * workspace as it is now; nothing the renderer or the model says about
 * eligibility is trusted. Steps run in the execution workspace with argument
 * arrays, save their progress on the responsibility and resume after a
 * failure. It never merges, never force-pushes and never pushes the base branch.
 */

export interface TarsCommandResult { ok: boolean; code: number | null; stdout: string; stderr: string }
/** Runs `git` or `gh` with an argument array in a directory, never through a shell. Tests pass a fake. */
export type TarsPublishRunner = (command: "git" | "gh", args: readonly string[], cwd: string) => Promise<TarsCommandResult>;

/** Where the work is: the execution workspace's directory and the base (the source workspace's branch, else the repository default). */
export interface TarsPublishWorkspace { path: string; base: string | null; repositoryName: string }

export interface TarsPublishPorts {
  conversations: Pick<TarsConversationStore, "recordPublish" | "settlePublish" | "getPublish" | "getReceipt" | "isPublishProposalOpen" | "listPublishes" | "hasOpenDelivery">;
  responsibilities: Pick<TarsStore, "get" | "patch" | "snapshot">;
  /** Null when the execution workspace is no longer registered or its directory is gone. */
  resolveWorkspace: (row: TarsResponsibility) => Promise<TarsPublishWorkspace | null>;
  /** The frozen report the body is built from; null when the run cannot be read. */
  readReport: (row: TarsResponsibility) => Promise<Pick<TarsReportModel, "state" | "criteria" | "evidenceGroups" | "frozenAt" | "finalRevision" | "outcome" | "publicationRevision"> | null>;
  readRevision?: (cwd: string) => Promise<WorkspaceRevision>;
  run: TarsPublishRunner;
  now?: () => string;
  onError?: (error: unknown) => void;
}

export class TarsPublishRejection extends Error {
  constructor(readonly reason: TarsPublishReason, message: string) { super(message); this.name = "TarsPublishRejection"; }
}

const refuse = (reason: TarsPublishReason, message: string): never => { throw new TarsPublishRejection(reason, message); };

/**
 * What the saved responsibility alone decides, at proposal and at
 * confirmation: Tars owns it, it completed with Stave's verification, the
 * revision is the one the user saw, it has an execution workspace and its
 * draft pull request is not open yet.
 */
export function admitTarsPublish(row: TarsResponsibility | null, request: { expectedRevision: number }): TarsResponsibility {
  if (!row) return refuse("notOwned", "The responsibility is not owned by the personal representative.");
  if (row.executionPending) refuse("inProgress", "A continuation is still being reconciled. Wait for its result.");
  if (row.state !== "completed" && row.state !== "resultReady") refuse("notCompleted", "Only verified execution results can be published.");
  if (row.state === "resultReady" && (!row.agentRunId || row.resultVerifiedRunId !== row.agentRunId))
    refuse("notVerified", "This restored result needs verification before publishing.");
  if (row.detailCode === "acceptedWithoutVerification")
    refuse("notVerified", "Stave did not verify this work; it was accepted as done without a check. Publish it yourself if you want it.");
  if (row.revision !== request.expectedRevision) refuse("stale", "The responsibility changed. Refresh before publishing.");
  if (row.publication?.state === "opened" && !tarsCanUpdatePublication(row)) refuse("alreadyPublished", "Its draft pull request is already open.");
  if (!row.executionWorkspaceId) refuse("noWorkspace", "The work has no execution workspace.");
  return row;
}

/** What the workspace and GitHub say right now; every field the card shows, and the first reason it cannot publish. */
interface TarsPublishFacts {
  cwd: string | null;
  base: string | null;
  head: string;
  repository: string | null;
  repositoryUrl: string | null;
  /** Uncommitted paths. */
  dirty: string[];
  changedFiles: number | null;
  /** Commits ahead of the base; null when the base could not be read. */
  ahead: number | null;
  reason: TarsPublishReason | null;
  error: string | null;
}

function diagnostic(result: TarsCommandResult, fallback: string) {
  return (`${result.stderr}\n${result.stdout}`.trim() || fallback).slice(0, 1_500);
}

function ghMissing(result: TarsCommandResult) {
  return /ENOENT|command not found|not recognized/i.test(`${result.stderr} ${result.stdout}`);
}

function ghSignedOut(result: TarsCommandResult) {
  return /not logged in|gh auth login|authentication/i.test(`${result.stderr} ${result.stdout}`);
}

const nulSeparated = (stdout: string) => stdout.split("\0").filter(Boolean);

/** `git status --porcelain -z` entries; a rename's second path (its source) is skipped. */
function statusPaths(stdout: string) {
  const entries = nulSeparated(stdout);
  const paths: string[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    paths.push(entry.slice(3));
    if (/^[RC]/.test(entry)) index += 1;
  }
  return paths;
}

async function inspect(row: TarsResponsibility, ports: TarsPublishPorts): Promise<TarsPublishFacts> {
  const head = row.publication?.number ? row.publication.branch : tarsPublishHeadBranch(row);
  const facts: TarsPublishFacts = { cwd: null, base: null, head, repository: null, repositoryUrl: null, dirty: [], changedFiles: null, ahead: null, reason: null, error: null };
  const stop = (reason: TarsPublishReason, error: string) => { facts.reason ??= reason; facts.error ??= error; return facts; };
  const workspace = row.executionWorkspaceId ? await ports.resolveWorkspace(row) : null;
  if (!workspace) return stop("noWorkspace", "The work's execution workspace is no longer available.");
  facts.cwd = workspace.path;
  facts.base = workspace.base;
  facts.repository = workspace.repositoryName;
  const git = (args: readonly string[]) => ports.run("git", args, workspace.path);
  const current = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!current.ok) return stop("noWorkspace", diagnostic(current, "The execution workspace is not a Git checkout."));
  // A rule-following name git refused falls back to `tars/<id>` (tars-host prepareWorkspace); both are this work's own.
  const fallback = `tars/${row.id}`;
  if (current.stdout.trim() === fallback && head !== fallback) facts.head = fallback;
  if (!workspace.base) stop("wrongBranch", "The base branch could not be determined.");
  else if (workspace.base === facts.head) stop("wrongBranch", "The work's branch is the base branch; Tars never pushes to it.");
  if (current.stdout.trim() !== facts.head) stop("wrongBranch", `The workspace is on ${current.stdout.trim() || "a detached HEAD"}, not the work's branch ${facts.head}.`);
  const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!status.ok) return stop("noWorkspace", diagnostic(status, "The workspace status could not be read."));
  facts.dirty = statusPaths(status.stdout);
  const changed = new Set(facts.dirty);
  let baseRef: string | null = null;
  for (const candidate of workspace.base ? [`refs/heads/${workspace.base}`, `refs/remotes/origin/${workspace.base}`] : []) {
    if ((await git(["rev-parse", "--verify", "--quiet", candidate])).ok) { baseRef = candidate; break; }
  }
  if (baseRef) {
    const count = await git(["rev-list", "--count", `${baseRef}..HEAD`]);
    facts.ahead = count.ok ? Number(count.stdout.trim()) || 0 : null;
    const diff = await git(["diff", "--name-only", "-z", `${baseRef}...HEAD`]);
    if (diff.ok) for (const file of nulSeparated(diff.stdout)) changed.add(file);
  }
  facts.changedFiles = changed.size;
  if (!changed.size && !facts.ahead && !row.publication?.commit)
    stop("noChanges", baseRef ? "Nothing is uncommitted and no commit is ahead of the base branch." : "Nothing is uncommitted and the base branch could not be read.");
  const remote = await git(["remote", "get-url", "origin"]);
  if (!remote.ok || !remote.stdout.trim()) return stop("noRemote", "The repository has no origin remote.");
  const repo = await ports.run("gh", ["repo", "view", "--json", "nameWithOwner,url"], workspace.path);
  if (!repo.ok) {
    if (ghMissing(repo)) return stop("ghUnavailable", "GitHub CLI is not installed. Install `gh` first.");
    if (ghSignedOut(repo)) return stop("ghUnavailable", "GitHub CLI is not signed in. Run `gh auth login` first.");
    return stop("noRemote", diagnostic(repo, "The origin remote is not a GitHub repository."));
  }
  try {
    const parsed = JSON.parse(repo.stdout) as { nameWithOwner?: unknown; url?: unknown };
    if (typeof parsed.nameWithOwner === "string" && parsed.nameWithOwner) facts.repository = parsed.nameWithOwner.slice(0, 300);
    if (typeof parsed.url === "string" && /^https?:\/\/\S+$/.test(parsed.url)) facts.repositoryUrl = parsed.url.slice(0, 2_048);
  } catch { /* The repository resolved; its name stays the folder's. */ }
  if (row.publication?.number && row.publication.url) {
    const current = await ports.run("gh", ["pr", "view", String(row.publication.number), "--json", "state,headRefName,url"], workspace.path);
    try {
      const live = JSON.parse(current.stdout);
      if (!current.ok || live.state !== "OPEN" || live.headRefName !== facts.head || live.url !== row.publication.url)
        stop("alreadyPublished", "The original pull request is no longer open on this branch.");
    } catch { stop("alreadyPublished", "The original pull request could not be verified."); }
  }
  return facts;
}

/** The commands each step runs, as argument arrays: never a force push, always a draft, always the work's own base and head. */
export const tarsPublishCommands = {
  // The commit the card published, by its SHA: a branch that moved after the commit step is not what gets pushed.
  push: (head: string, commit: string): string[] => ["push", "origin", `${commit}:refs/heads/${head}`],
  existing: (head: string): string[] => ["pr", "list", `--head=${head}`, "--state=open", "--json=number,url", "--limit=1"],
  // `--flag=value`, so a title or body that starts with "-" can never read as another flag.
  create: (args: { base: string; head: string; title: string; body: string }): string[] =>
    ["pr", "create", "--draft", `--base=${args.base}`, `--head=${args.head}`, `--title=${args.title}`, `--body=${args.body}`],
};

function parseExistingPullRequest(stdout: string): { url: string; number: number | null } | null {
  try {
    const list = JSON.parse(stdout) as Array<{ url?: unknown; number?: unknown }>;
    const first = Array.isArray(list) ? list[0] : undefined;
    if (!first || typeof first.url !== "string" || !/^https?:\/\/\S+$/.test(first.url)) return null;
    return { url: first.url, number: typeof first.number === "number" ? first.number : tarsPullRequestNumber(first.url) };
  } catch { return null; }
}

function lastUrl(text: string) {
  return text.match(/https?:\/\/\S+/g)?.at(-1) ?? null;
}

class TarsPublishStepFailure extends Error {
  constructor(readonly step: TarsPublicationStep, readonly reason: TarsPublishReason, message: string) { super(message); this.name = "TarsPublishStepFailure"; }
}

export function createTarsPublisher(ports: TarsPublishPorts) {
  const now = ports.now ?? (() => new Date().toISOString());
  // One publish per responsibility at a time; a repeated request id joins the running one.
  const inflight = new Map<string, { requestId: string; promise: Promise<TarsPublishResult> }>();

  /** Saves the publication on the current row, which only this path writes once the work completed. */
  function save(id: string, publication: TarsPublication) {
    for (let attempt = 0; ; attempt += 1) {
      const row = ports.responsibilities.get(id);
      if (!row) throw new TarsPublishRejection("notOwned", "The responsibility is not owned by the personal representative.");
      if (row.executionPending || ports.conversations.hasOpenDelivery(id))
        refuse("inProgress", "Follow-up work is queued or starting. Wait for its result before publishing.");
      if (publication.agentRunId && publication.agentRunId !== row.agentRunId)
        throw new TarsPublishRejection("stale", "The execution changed during publication.");
      try { return ports.responsibilities.patch(id, row.revision, { publication, ...(publication.state === "opened" && row.completionGoal === "pullRequest"
          ? { state: "completed" as const } : {}) }, now()); }
      catch (error) {
        // Only a concurrent revision bump is retried; a lock wait or invalid state is not.
        if (attempt >= 2 || isTarsStorageBusy(error) || !/changed/i.test(error instanceof Error ? error.message : "")) throw error;
      }
    }
  }

  async function execute(row: TarsResponsibility, record: TarsPublishRecord, facts: TarsPublishFacts): Promise<TarsPublication> {
    const cwd = facts.cwd!;
    const base = facts.base!;
    const head = facts.head;
    const git = (args: readonly string[]) => ports.run("git", args, cwd);
    const updating = tarsCanUpdatePublication(row);
    const previous = updating ? null : row.publication ?? null;
    const openPr = row.publication?.number && row.publication.url ? row.publication : null;
    let publication: TarsPublication = {
      ...(openPr?.watch ? { watch: updating ? { ...openPr.watch, startedAt: now(), nextAt: now(), polls: 0, stopped: null } : openPr.watch } : {}),
      ...(row.agentRunId ? { agentRunId: row.agentRunId } : {}),
      state: "committing", failedStep: null, commit: previous?.commit ?? null, branch: head, base,
      // A step already done keeps the words it was done with.
      commitMessage: previous?.commit ? previous.commitMessage : record.commitMessage, title: record.title,
      url: openPr?.url ?? null, number: openPr?.number ?? null, error: null, reason: null, updatedAt: now(),
    };
    let step = tarsPublicationResumeStep(previous) ?? "commit";
    const advance = (patch: Partial<TarsPublication>) => {
      publication = { ...publication, ...patch, updatedAt: now() };
      save(row.id, publication);
    };
    const fail = (reason: TarsPublishReason, message: string): never => { throw new TarsPublishStepFailure(step, reason, message); };
    const onBranch = async () => {
      const current = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (!current.ok || current.stdout.trim() !== head) fail("wrongBranch", `The workspace is no longer on the work's branch ${head}.`);
    };
    const report = await ports.readReport(row);
    const verify = async () => {
      const beforeHead = await git(["rev-parse", "HEAD"]);
      const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
      const revision = await (ports.readRevision ?? readWorkspaceRevision)(cwd);
      if (report?.state !== "frozen" || report.outcome !== "completed" || !status.ok || status.stdout || !revisionsMatch(report.publicationRevision, revision))
        fail("notVerified", "The workspace changed or has uncommitted edits. Commit and verify the current work before publishing.");
      const sha = await git(["rev-parse", "HEAD"]);
      if (!beforeHead.ok || beforeHead.stdout !== sha.stdout || !sha.ok || !/^[0-9a-f]{40,64}$/.test(sha.stdout.trim()) || publication.commit && publication.commit !== sha.stdout.trim())
        fail("notVerified", "The verified HEAD changed. Verify the current work before publishing.");
      return sha.stdout.trim();
    };
    try {
      const verifiedHead = await verify();
      if (step === "commit") {
        advance({ state: "committing" });
        await onBranch();
        if (!facts.ahead) fail("noChanges", "No commit is ahead of the base branch.");
        advance({ state: "committed", commit: verifiedHead });
        step = "push";
      } else advance({ state: step === "push" ? "committed" : "pushed" });
      if (step === "push") {
        await onBranch();
        const commit = publication.commit;
        // Resumed after a failed push: the saved commit is what the user confirmed, so only that is pushed.
        if (!commit || !(await git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${commit}^{commit}`])).ok)
          fail("publishFailed", "The verified commit no longer exists. Commit and verify the current work before publishing.");
        await verify();
        const pushed = await git(tarsPublishCommands.push(head, commit!));
        if (!pushed.ok) fail("publishFailed", diagnostic(pushed, "git push failed."));
        advance({ state: "pushed" });
        step = "pr";
      }
      if (openPr) {
        const current = await ports.run("gh", ["pr", "view", String(openPr.number), "--json", "state,headRefName,url"], cwd);
        let live: { state?: string; headRefName?: string; url?: string } = {};
        try { live = JSON.parse(current.stdout); } catch { /* Fail closed below. */ }
        if (!current.ok || live.state !== "OPEN" || live.headRefName !== head || live.url !== openPr.url)
          fail("alreadyPublished", "The original pull request is no longer open on this branch.");
        advance({ state: "opened", url: openPr.url, number: openPr.number, existing: true });
        return publication;
      }
      const listed = await ports.run("gh", tarsPublishCommands.existing(head), cwd);
      if (!listed.ok && (ghMissing(listed) || ghSignedOut(listed))) fail("ghUnavailable", diagnostic(listed, "GitHub CLI is unavailable."));
      let opened = listed.ok ? parseExistingPullRequest(listed.stdout) : null;
      let existing = opened !== null;
      if (!opened) {
        await verify();
        const body = buildTarsPublicationBody({ title: row.title, report, source: record.source });
        const created = await ports.run("gh", tarsPublishCommands.create({ base, head, title: record.title, body }), cwd);
        const url = lastUrl(created.ok ? created.stdout : `${created.stderr}\n${created.stdout}`);
        // gh refuses a second pull request for the branch and names the one that exists.
        if (!created.ok && !(url && /already exists/i.test(created.stderr))) fail(ghMissing(created) || ghSignedOut(created) ? "ghUnavailable" : "publishFailed",
          diagnostic(created, "gh pr create failed."));
        if (!url) fail("publishFailed", "gh pr create did not print the pull request URL.");
        existing = !created.ok;
        opened = { url: url!, number: tarsPullRequestNumber(url!) };
      }
      advance({ state: "opened", url: opened.url, number: opened.number, ...(existing ? { existing: true } : {}) });
      return publication;
    } catch (error) {
      if (isTarsStorageBusy(error)) throw error;
      const failure = error instanceof TarsPublishStepFailure ? error
        : new TarsPublishStepFailure(step, error instanceof TarsPublishRejection ? error.reason : "publishFailed",
          error instanceof Error ? error.message : "The publish step failed.");
      publication = { ...publication, state: "failed", failedStep: failure.step, reason: failure.reason,
        error: failure.message.slice(0, 2_000) || "The publish step failed.", updatedAt: now() };
      try { save(row.id, publication); } catch (saveError) { ports.onError?.(saveError); }
      throw failure;
    }
  }

  async function settle(record: TarsPublishRecord): Promise<TarsPublishResult> {
    const reject = (reason: TarsPublishReason, error: string) => ({ record: ports.conversations.settlePublish(record.requestId, { status: "rejected", reason, error }, now()) });
    // A retry of this same request after a lock wait finds the revision moved by its own saved steps;
    // it was admitted at its revision before it started, so it continues instead of reading as stale.
    const admit = () => {
      const row = ports.responsibilities.get(record.responsibilityId);
      if (ports.conversations.hasOpenDelivery(record.responsibilityId))
        refuse("inProgress", "Follow-up work is queued. Wait for its result before publishing.");
      const startedHere = row?.publication !== undefined && isTarsPublicationUnfinished(row.publication) && row.publication.updatedAt >= record.createdAt;
      return admitTarsPublish(row, startedHere ? { expectedRevision: row!.revision } : record);
    };
    try {
      const row = admit();
      const facts = await inspect(row, ports);
      if (facts.reason) return reject(facts.reason, facts.error ?? "The work cannot be published.");
      // Re-read after the asynchronous inspection: the work must still be where the user saw it.
      const current = admit();
      const publication = await execute(current, record, facts);
      return { record: ports.conversations.settlePublish(record.requestId,
        { status: "applied", url: publication.url!, number: publication.number, existing: publication.existing }, now()) };
    } catch (error) {
      if (isTarsStorageBusy(error)) throw new TarsStorageBusyError();
      if (error instanceof TarsPublishRejection || error instanceof TarsPublishStepFailure) return reject(error.reason, error.message);
      return reject("unknown", (error instanceof Error ? error.message : "The work could not be published.").slice(0, 2_000) || "The work could not be published.");
    }
  }

  /**
   * A confirmation names its proposal by request id and must repeat it
   * exactly: it may only publish what the user was shown.
   */
  function confirmedProposal(input: { requestId: string; responsibilityId: string; expectedRevision: number }): TarsProposalRef | null {
    const ref = parseTarsPublishProposalRequestId(input.requestId);
    if (!ref) return null;
    const action = ports.conversations.getReceipt(ref.messageId, ref.actionIndex)?.action;
    if (action?.kind !== "publish" || action.responsibilityId !== input.responsibilityId || action.expectedRevision !== input.expectedRevision)
      throw new Error("This confirmation does not match its proposal.");
    if (!ports.conversations.isPublishProposalOpen(ref, input.requestId)) throw new Error("This proposal is not awaiting confirmation.");
    return ref;
  }

  return {
    /** Confirms one card. Recorded first, admitted and run once; a repeated request id returns the same outcome. */
    async publish(rawInput: unknown): Promise<TarsPublishResult> {
      const input = TarsPublishInputSchema.parse(rawInput);
      const running = inflight.get(input.responsibilityId);
      if (running?.requestId === input.requestId) return running.promise;
      try {
        const proposal = confirmedProposal(input);
        const record = ports.conversations.recordPublish(input, proposal, now());
        if (record.status !== "pending") return { record };
        if (running) return { record: ports.conversations.settlePublish(record.requestId,
          { status: "rejected", reason: "inProgress", error: "Another publish of this work is running." }, now()) };
        const promise = settle(record).finally(() => inflight.delete(input.responsibilityId));
        inflight.set(input.responsibilityId, { requestId: input.requestId, promise });
        return await promise;
      } catch (error) {
        throw isTarsStorageBusy(error) ? new TarsStorageBusyError() : error;
      }
    },
    /** What the card shows: read only, so opening and closing a card never changes work. */
    async preview(rawInput: unknown): Promise<TarsPublishPreview> {
      const { responsibilityId } = TarsPublishPreviewInputSchema.parse(rawInput);
      const row = ports.responsibilities.get(responsibilityId);
      if (!row) throw new Error("The responsibility is not owned by the personal representative.");
      let reason: TarsPublishReason | null = null;
      try {
        if (ports.conversations.hasOpenDelivery(row.id)) refuse("inProgress", "Follow-up work is queued. Wait for its result before publishing.");
        admitTarsPublish(row, { expectedRevision: row.revision });
      } catch (error) { reason = error instanceof TarsPublishRejection ? error.reason : "unknown"; }
      const facts = reason === "notOwned" || reason === "noWorkspace" ? null : await inspect(row, ports);
      if (!reason && facts?.cwd) {
        const report = await ports.readReport(row);
        const revision = await (ports.readRevision ?? readWorkspaceRevision)(facts.cwd);
        if (facts.dirty.length || report?.state !== "frozen" || report.outcome !== "completed" || !revisionsMatch(report.publicationRevision, revision)) reason = "notVerified";
      }
      if (inflight.has(row.id)) reason ??= "inProgress";
      return TarsPublishPreviewSchema.parse({
        responsibilityId: row.id, revision: row.revision, reason: reason ?? facts?.reason ?? null,
        repository: facts?.repository ?? null, repositoryUrl: facts?.repositoryUrl ?? null, base: facts?.base ?? null,
        head: facts?.head ?? tarsPublishHeadBranch(row), changedFiles: facts?.changedFiles ?? null,
        body: buildTarsPublicationBody({ title: row.title, report: await ports.readReport(row) }), publication: row.publication ?? null,
      });
    },
    /**
     * After a restart nothing is running: an unfinished publication becomes
     * failed at the step it stopped in, and its pending confirmation is
     * settled, so the card offers Retry instead of waiting forever.
     */
    recover() {
      const at = now();
      for (const row of ports.responsibilities.snapshot().responsibilities) {
        if (!isTarsPublicationUnfinished(row.publication) || inflight.has(row.id)) continue;
        try {
          save(row.id, { ...row.publication!, state: "failed", failedStep: tarsPublicationResumeStep(row.publication) ?? "commit", reason: "publishFailed",
            error: "Publishing was interrupted before it finished. Retry to continue from the step that stopped.", updatedAt: at });
        } catch (error) { ports.onError?.(error); }
      }
      for (const record of ports.conversations.listPublishes(1_000)) {
        if (record.status !== "pending" || inflight.has(record.responsibilityId)) continue;
        try {
          ports.conversations.settlePublish(record.requestId, { status: "rejected", reason: "publishFailed",
            error: "Publishing was interrupted before it finished. Retry to continue from the step that stopped." }, at);
        } catch (error) { ports.onError?.(error); }
      }
    },
  };
}

/** For the proposal path: why a model's publish proposal cannot wait for confirmation, or null. */
export function tarsPublishProposalRefusal(row: TarsResponsibility | null, action: { expectedRevision: number }): { reason: TarsPublishReason; error: string } | null {
  try { admitTarsPublish(row, action); return null; }
  catch (error) {
    return error instanceof TarsPublishRejection ? { reason: error.reason, error: error.message } : { reason: "unknown", error: "The publish could not be admitted." };
  }
}
