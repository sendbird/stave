import { z } from "zod";
import {
  GITHUB_PR_LOG_MAX_BYTES,
  GITHUB_PR_MAX_JOBS,
  GITHUB_PR_MAX_RUNS,
  parseGitHubPrActivityRef,
  type GitHubPrActivityArgs,
  type GitHubPrActivityFailure,
  type GitHubPrActivityResult,
  type GitHubPrWorkflowRun,
} from "../../src/lib/github-pr-activity";
import { sanitizePrContextLogTail, sanitizePrContextText } from "../../src/lib/pr-context";
import type { CommandResult } from "../main/types";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth, invalidateGhAuthCache } from "./gh-auth";
import { readPrReviewThreads } from "./pr-context-runtime";

type PrRef = NonNullable<ReturnType<typeof parseGitHubPrActivityRef>>;
type Reason = GitHubPrActivityFailure["reason"];
type ThreadWrite = Extract<GitHubPrActivityArgs, { action: "reply" | "resolve" }>;

const failedConclusion = z.enum(["failure", "timed_out"]);
const runState = z.object({
  run_attempt: z.number().int().positive(),
  status: z.string(),
  conclusion: z.string().nullable(),
});
const jobState = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  steps: z.array(z.object({
    number: z.number().int().nonnegative(),
    name: z.string(),
    conclusion: z.string().nullable(),
  })).optional(),
});
const workflowRunSchema = z.object({
  url: z.string(),
  workflow: z.object({ name: z.string().nullish() }).nullish(),
});
const checkContexts = z.object({
  nodes: z.array(z.object({
    checkSuite: z.object({ workflowRun: workflowRunSchema.nullable() }).nullish(),
  }).nullable()),
  pageInfo: z.object({ hasNextPage: z.boolean() }),
});
const prChecks = z.object({
  repository: z.object({
    pullRequest: z.object({
      commits: z.object({
        nodes: z.array(z.object({
          commit: z.object({ statusCheckRollup: z.object({ contexts: checkContexts }).nullable() }),
        })),
      }),
    }),
  }),
});

const PR_WORKFLOW_RUNS = `query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      commits(last:1){
        nodes{commit{statusCheckRollup{contexts(first:100){
          nodes{... on CheckRun{checkSuite{workflowRun{url workflow{name}}}}}
          pageInfo{hasNextPage}
        }}}}
      }
    }
  }
}`;

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const repoName = (ref: PrRef) => `${ref.owner}/${ref.repo}`;

function api(endpoint: string, ...fields: string[]) {
  return ["api", endpoint, "--hostname", "github.com", ...fields];
}

function graphql(query: string, ...fields: string[]) {
  return api("graphql", "-f", `query=${query}`, ...fields);
}

const THREAD_TARGET = `query($id:ID!){
  node(id:$id){ ... on PullRequestReviewThread{
    repository{ nameWithOwner }
    pullRequest{ number }
    isResolved viewerCanReply viewerCanResolve viewerCanUnresolve
  } }
}`;

const THREAD_REPLY = `mutation($id:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$id,body:$body}){comment{id}}
}`;

export function buildPrCommentArgs(ref: PrRef, body: string) {
  return {
    commandArgs: api(`repos/${repoName(ref)}/issues/${ref.number}/comments`, "--method", "POST", "--input", "-"),
    input: JSON.stringify({ body }),
  };
}

export function buildPrThreadWriteArgs(args: ThreadWrite) {
  if (args.action === "reply") {
    return {
      commandArgs: api("graphql", "--method", "POST", "--input", "-"),
      input: JSON.stringify({ query: THREAD_REPLY, variables: { id: args.threadId, body: args.body } }),
    };
  }
  const mutation = args.resolved ? "resolveReviewThread" : "unresolveReviewThread";
  return {
    commandArgs: graphql(
      `mutation($id:ID!){${mutation}(input:{threadId:$id}){thread{id isResolved}}}`,
      "-f", `id=${args.threadId}`,
    ),
  };
}

export function buildPrRerunArgs(ref: PrRef, runId: number) {
  return ["run", "rerun", String(runId), "--repo", `github.com/${repoName(ref)}`, "--failed"];
}

export function parsePrWorkflowRuns(ref: PrRef, input: unknown) {
  const { repository } = prChecks.parse(input);
  const contexts = repository.pullRequest.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  const runs = new Map<number, GitHubPrWorkflowRun>();
  for (const node of contexts?.nodes ?? []) {
    const workflowRun = node?.checkSuite?.workflowRun;
    if (!workflowRun) continue;
    // Use the server-owned workflow relation. An integration can set the
    // check's detailsUrl to an arbitrary run without belonging to that run.
    const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)$/i.exec(workflowRun.url);
    const [, workflowRepository, runId] = match ?? [];
    if (!workflowRepository || !runId || !sameRepo(workflowRepository, repoName(ref))) continue;
    const id = Number(runId);
    if (!Number.isSafeInteger(id) || id <= 0 || runs.has(id)) continue;
    runs.set(id, { id, name: sanitizePrContextText(workflowRun.workflow?.name ?? "", 256) });
  }
  return {
    runs: [...runs.values()].sort((a, b) => b.id - a.id),
    partial: contexts?.pageInfo.hasNextPage ?? false,
  };
}

export function parsePrWorkflowJobs(input: unknown) {
  const { total_count, jobs } = z.object({ total_count: z.number().int().nonnegative(), jobs: z.array(jobState) }).parse(input);
  const bounded = jobs.slice(0, GITHUB_PR_MAX_JOBS);
  return {
    omitted: Math.max(0, total_count - bounded.length),
    jobs: bounded.map((job) => ({
      id: job.id,
      name: sanitizePrContextText(job.name, 256),
      status: job.status.slice(0, 64),
      conclusion: job.conclusion?.slice(0, 64) ?? "",
      failedSteps: (job.steps ?? [])
        .filter((step) => failedConclusion.safeParse(step.conclusion).success)
        .slice(0, 100)
        .map((step) => ({
          number: step.number,
          name: sanitizePrContextText(step.name, 256),
        })),
    })),
  };
}

export function boundedPrLogTail(stdout: string, captureTruncated = false) {
  // Discard a partial first line before redaction so a split secret assignment
  // cannot lose its key while keeping the value.
  const firstBreak = stdout.indexOf("\n");
  const completeLines = captureTruncated ? (firstBreak === -1 ? "" : stdout.slice(firstBreak + 1)) : stdout;
  const text = sanitizePrContextLogTail(completeLines, Number.POSITIVE_INFINITY);
  const bytes = Buffer.from(text, "utf8");
  let start = Math.max(0, bytes.length - GITHUB_PR_LOG_MAX_BYTES);
  while (((bytes[start] ?? 0) & 0xc0) === 0x80) start += 1;
  return {
    text: bytes.toString("utf8", start),
    truncated: captureTruncated || start > 0,
  };
}

class GitHubRequestError extends Error {
  constructor(readonly failure: GitHubPrActivityFailure) {
    super(failure.detail);
  }
}

function fail(reason: Reason, detail?: string): never {
  throw new GitHubRequestError({ ok: false, reason, detail });
}

function commandFailure(result: CommandResult, cwd?: string): never {
  const output = `${result.stderr}\n${result.stdout}`;
  if (/spawn gh ENOENT|command not found/i.test(output)) {
    invalidateGhAuthCache({ cwd, hostname: "github.com" });
    fail("missing-gh");
  }
  if (/authentication failed|not logged (?:in|into)|gh auth login|not authenticated|HTTP 401/i.test(output)) {
    invalidateGhAuthCache({ cwd, hostname: "github.com" });
    fail("unauthenticated");
  }
  if (result.code === -1 && /Command timed out after/i.test(result.stderr)) fail("timeout");
  fail("failed", sanitizePrContextText(result.stderr, 300));
}

function readJson(result: CommandResult): unknown {
  if (result.stdoutTruncated) fail("oversized-response");
  return JSON.parse(result.stdout);
}

function graphData(result: CommandResult) {
  const payload = z.object({ data: z.record(z.string(), z.unknown()), errors: z.array(z.unknown()).optional() }).parse(readJson(result));
  if (payload.errors?.length) fail("invalid-response");
  return payload.data;
}

export async function runGitHubPrActivity(
  args: GitHubPrActivityArgs,
  runCommand = runCommandArgs,
): Promise<GitHubPrActivityResult> {
  const ref = parseGitHubPrActivityRef(args.prUrl);
  if (!ref) return { ok: false, reason: "failed" };
  const { action, cwd } = args;
  const repo = repoName(ref);

  async function gh(commandArgs: string[], options?: { maxOutputChars?: number; input?: string }) {
    const result = await runCommand({
      command: "gh",
      commandArgs,
      cwd,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
      timeoutMs: 18_000,
      maxOutputChars: options?.maxOutputChars ?? 2_000_000,
      input: options?.input,
    });
    if (!result.ok) commandFailure(result, cwd);
    return result;
  }

  const readRuns = async () => {
    const result = await gh(graphql(PR_WORKFLOW_RUNS, "-f", `owner=${ref.owner}`, "-f", `repo=${ref.repo}`, "-F", `pr=${ref.number}`));
    return parsePrWorkflowRuns(ref, graphData(result));
  };

  try {
    const auth = await ensureGhAuth({ cwd, runCommand, hostname: "github.com" });
    if (!auth.ok) commandFailure(auth, cwd);

    switch (action) {
      case "discussion": {
        const result = await readPrReviewThreads(ref, cwd, (command) =>
          gh(command.commandArgs ?? [], { maxOutputChars: command.maxOutputChars }), true);
        if (!result.ok) fail("invalid-response");
        const { threads, omittedThreads, comments, omittedComments } = result;
        return { ok: true, kind: "discussion", threads, omittedThreads, comments, omittedComments };
      }
      case "comment": {
        const { commandArgs, input } = buildPrCommentArgs(ref, args.body);
        z.object({ id: z.number().int().positive() }).parse(readJson(await gh(commandArgs, { input })));
        return { ok: true, kind: "written" };
      }
      case "reply":
      case "resolve": {
        const data = graphData(await gh(graphql(THREAD_TARGET, "-f", `id=${args.threadId}`)));
        const thread = z.object({
          repository: z.object({ nameWithOwner: z.string() }),
          pullRequest: z.object({ number: z.number() }),
          isResolved: z.boolean(),
          viewerCanReply: z.boolean(),
          viewerCanResolve: z.boolean(),
          viewerCanUnresolve: z.boolean(),
        }).nullable().parse(data.node);
        if (!thread || !sameRepo(thread.repository.nameWithOwner, repo) || thread.pullRequest.number !== ref.number) {
          fail("wrong-thread");
        }
        if (action === "resolve" && args.resolved === thread.isResolved) return { ok: true, kind: "written" };
        if (!(action === "reply" ? thread.viewerCanReply : args.resolved ? thread.viewerCanResolve : thread.viewerCanUnresolve)) {
          fail("thread-permission");
        }
        const { commandArgs, input } = buildPrThreadWriteArgs(args);
        const response = graphData(await gh(commandArgs, { input }));
        const nodeId = z.string().min(1);
        if (action === "reply") {
          z.object({ comment: z.object({ id: nodeId }) }).parse(response.addPullRequestReviewThreadReply);
        } else {
          z.object({ thread: z.object({ id: z.literal(args.threadId), isResolved: z.literal(args.resolved) }) })
            .parse(response[args.resolved ? "resolveReviewThread" : "unresolveReviewThread"]);
        }
        return { ok: true, kind: "written" };
      }
      case "runs": {
        const { runs, partial } = await readRuns();
        return {
          ok: true,
          kind: "runs",
          runs: runs.slice(0, GITHUB_PR_MAX_RUNS),
          omitted: Math.max(0, runs.length - GITHUB_PR_MAX_RUNS),
          partial,
        };
      }
      case "jobs":
      case "log":
      case "rerun": {
        const { runs } = await readRuns();
        if (!runs.some((run) => run.id === args.runId)) fail("unlinked-run");
        const runPath = `repos/${repo}/actions/runs/${args.runId}`;
        if (action === "log") {
          const job = jobState.extend({ run_id: z.number() }).parse(
            readJson(await gh(api(`repos/${repo}/actions/jobs/${args.jobId}`))),
          );
          if (job.run_id !== args.runId || job.status !== "completed" || !failedConclusion.safeParse(job.conclusion).success) {
            fail("invalid-job");
          }
          const log = await gh(["run", "view", "--repo", `github.com/${repo}`, "--job", String(args.jobId), "--log-failed"], { maxOutputChars: 128_000 });
          return { ok: true, kind: "log", ...boundedPrLogTail(log.stdout, log.stdoutTruncated) };
        }
        const run = runState.parse(readJson(await gh(api(runPath))));
        if (action === "rerun") {
          if (run.run_attempt !== args.attempt || run.status !== "completed" || !failedConclusion.safeParse(run.conclusion).success) {
            fail("stale-run");
          }
          await gh(buildPrRerunArgs(ref, args.runId));
          return { ok: true, kind: "written" };
        }
        const jobs = await gh(api(`${runPath}/attempts/${run.run_attempt}/jobs?per_page=${GITHUB_PR_MAX_JOBS}`));
        return {
          ok: true, kind: "jobs", attempt: run.run_attempt, status: run.status.slice(0, 64), conclusion: run.conclusion?.slice(0, 64) ?? "",
          ...parsePrWorkflowJobs(readJson(jobs)),
        };
      }
    }
  } catch (error) {
    if (error instanceof GitHubRequestError) return error.failure;
    return { ok: false, reason: "invalid-response" };
  }
}
