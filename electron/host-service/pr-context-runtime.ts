// ---------------------------------------------------------------------------
// PR review + failed-CI context — host-side fetch
// ---------------------------------------------------------------------------
//
// Used by:
// - `electron/host-service.ts` — the `scm.fetch-pr-context-index` and
//   `scm.fetch-pr-check-logs` dispatch arms.
// - reached from the renderer through `window.api.sourceControl.fetchPrContextIndex`
//   / `fetchPrCheckLogs` (see `electron/main/ipc/scm.ts`).
//
// Two rules this module exists to enforce:
// 1. Metadata first. The index never fetches a log. Log excerpts are fetched
//    only for check ids the user explicitly selected.
// 2. Nothing leaves here unbounded or unredacted. Every string crossing back
//    goes through `sanitizePrContextText` / `sanitizePrContextLogTail`, and no
//    comment body or log line is ever written to a log.

import {
  PR_CONTEXT_LIMITS,
  parsePrContextUrl,
  type PrCheckFailure,
  type PrCheckLogExcerpt,
  type PrContextIndex,
  type PrReviewComment,
  type PrReviewThread,
  sanitizePrContextLogTail,
  sanitizePrContextText,
} from "../../src/lib/pr-context";
import { runCommandArgs } from "../main/utils/command";
import { ensureGhAuth, invalidateGhAuthCache } from "./gh-auth";

type RunCommand = typeof runCommandArgs;

export interface HostPrContextIndexResult {
  ok: boolean;
  index: PrContextIndex | null;
  stderr: string;
}

export interface HostPrCheckLogsResult {
  ok: boolean;
  excerpts: PrCheckLogExcerpt[];
  stderr: string;
}

const FAILED_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "stale",
]);

const GH_MAX_OUTPUT_CHARS = 4_000_000;
const GH_TIMEOUT_MS = 60_000;

function describeGhFailure(result: { stdout?: string; stderr?: string }) {
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (/spawn gh ENOENT|command not found|not recognized/i.test(detail)) {
    return "GitHub CLI is not installed. Install `gh` first.";
  }
  if (
    /authentication failed|not logged into|gh auth login|not authenticated/i.test(
      detail,
    )
  ) {
    return "GitHub CLI is not authenticated. Run `gh auth login` first.";
  }
  // Never echo the raw body back; only the first line of stderr.
  return (result.stderr ?? "").split("\n")[0]?.slice(0, 300) || "GitHub request failed.";
}

function invalidateAuthOnFailure(
  result: { ok: boolean; stdout?: string; stderr?: string },
  cwd?: string,
) {
  if (result.ok) {
    return;
  }
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (
    /authentication failed|not logged into|gh auth login|not authenticated/i.test(
      detail,
    )
  ) {
    invalidateGhAuthCache({ cwd });
  }
}

function asString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? sanitizePrContextText(value, maxChars) : "";
}

function asPlainString(value: unknown, maxChars: number): string {
  // Identifiers and URLs: strip control sequences and cap, but never run
  // credential redaction over them (a URL is not a secret assignment).
  return typeof value === "string"
    ? sanitizePrContextText(value, maxChars).replace(/\n/g, " ").trim()
    : "";
}

// ---------------------------------------------------------------------------
// Index — PR head, review threads, failed checks. No logs.
// ---------------------------------------------------------------------------

const REVIEW_THREADS_QUERY = `query($owner:String!,$repo:String!,$pr:Int!,$threads:Int!,$comments:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      title
      headRefOid
      url
      reviewThreads(first:$threads){
        totalCount
        nodes{
          id
          isResolved
          isOutdated
          path
          line
          comments(last:$comments){
            totalCount
            nodes{ id body createdAt url author{ login } }
          }
        }
      }
    }
  }
}`;

function mapComment(raw: unknown): PrReviewComment | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const node = raw as Record<string, unknown>;
  const author = node.author as Record<string, unknown> | null | undefined;
  return {
    id: asPlainString(node.id, PR_CONTEXT_LIMITS.maxNameChars),
    author: asPlainString(author?.login, PR_CONTEXT_LIMITS.maxLoginChars),
    body: asString(node.body, PR_CONTEXT_LIMITS.maxCommentChars),
    createdAt: asPlainString(
      node.createdAt,
      PR_CONTEXT_LIMITS.maxTimestampChars,
    ),
    url: asPlainString(node.url, PR_CONTEXT_LIMITS.maxUrlChars),
  };
}

function mapThread(raw: unknown): PrReviewThread | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const node = raw as Record<string, unknown>;
  const id = asPlainString(node.id, PR_CONTEXT_LIMITS.maxNameChars);
  if (!id) {
    return null;
  }
  const commentBlock = node.comments as Record<string, unknown> | undefined;
  const rawComments = Array.isArray(commentBlock?.nodes)
    ? (commentBlock.nodes as unknown[])
    : [];
  const comments = rawComments
    .map(mapComment)
    .filter((comment): comment is PrReviewComment => comment !== null)
    .slice(-PR_CONTEXT_LIMITS.maxCommentsPerThread);
  const totalComments =
    typeof commentBlock?.totalCount === "number"
      ? commentBlock.totalCount
      : rawComments.length;
  return {
    id,
    isResolved: node.isResolved === true,
    isOutdated: node.isOutdated === true,
    path: asPlainString(node.path, PR_CONTEXT_LIMITS.maxPathChars),
    line: typeof node.line === "number" ? Math.max(0, Math.trunc(node.line)) : null,
    comments,
    truncatedComments: Math.max(0, totalComments - comments.length),
  };
}

function mapCheckRun(raw: unknown): PrCheckFailure | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const node = raw as Record<string, unknown>;
  const conclusion =
    typeof node.conclusion === "string" ? node.conclusion.toLowerCase() : "";
  if (!FAILED_CONCLUSIONS.has(conclusion)) {
    return null;
  }
  const id = typeof node.id === "number" ? Math.trunc(node.id) : NaN;
  if (!Number.isSafeInteger(id) || id < 0) {
    return null;
  }
  const output = node.output as Record<string, unknown> | undefined;
  const app = node.app as Record<string, unknown> | undefined;
  return {
    id,
    name: asPlainString(node.name, PR_CONTEXT_LIMITS.maxNameChars),
    workflowName: asPlainString(app?.name, PR_CONTEXT_LIMITS.maxNameChars),
    conclusion,
    detailsUrl: asPlainString(node.details_url, PR_CONTEXT_LIMITS.maxUrlChars),
    completedAt: asPlainString(
      node.completed_at,
      PR_CONTEXT_LIMITS.maxTimestampChars,
    ),
    annotationCount:
      typeof output?.annotations_count === "number"
        ? Math.max(0, Math.trunc(output.annotations_count))
        : 0,
  };
}

export async function fetchPrContextIndex(args: {
  cwd?: string;
  prUrl: string;
  /** Injected in tests; production always uses the real spawn. */
  runCommand?: RunCommand;
  now?: () => number;
}): Promise<HostPrContextIndexResult> {
  const run = args.runCommand ?? runCommandArgs;
  const ref = parsePrContextUrl(args.prUrl);
  if (!ref) {
    return { ok: false, index: null, stderr: "Not a GitHub pull request URL." };
  }

  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
  if (!auth.ok) {
    return {
      ok: false,
      index: null,
      stderr: describeGhFailure(auth),
    };
  }

  const graphResult = await run({
    command: "gh",
    commandArgs: [
      "api",
      "graphql",
      "-f",
      `query=${REVIEW_THREADS_QUERY}`,
      "-f",
      `owner=${ref.owner}`,
      "-f",
      `repo=${ref.repo}`,
      "-F",
      `pr=${ref.number}`,
      "-F",
      `threads=${PR_CONTEXT_LIMITS.maxThreads}`,
      "-F",
      `comments=${PR_CONTEXT_LIMITS.maxCommentsPerThread}`,
    ],
    cwd: args.cwd,
    maxOutputChars: GH_MAX_OUTPUT_CHARS,
    timeoutMs: GH_TIMEOUT_MS,
  });
  invalidateAuthOnFailure(graphResult, args.cwd);
  if (!graphResult.ok) {
    return { ok: false, index: null, stderr: describeGhFailure(graphResult) };
  }

  let pullRequest: Record<string, unknown>;
  try {
    const parsed = JSON.parse(graphResult.stdout) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown> | undefined;
    const repository = data?.repository as Record<string, unknown> | undefined;
    const candidate = repository?.pullRequest as
      | Record<string, unknown>
      | undefined;
    if (!candidate) {
      return {
        ok: false,
        index: null,
        stderr: "Pull request not found.",
      };
    }
    pullRequest = candidate;
  } catch {
    return {
      ok: false,
      index: null,
      stderr: "Could not read the GitHub response.",
    };
  }

  const headSha = asPlainString(pullRequest.headRefOid, 64);
  const threadBlock = pullRequest.reviewThreads as
    | Record<string, unknown>
    | undefined;
  const rawThreads = Array.isArray(threadBlock?.nodes)
    ? (threadBlock.nodes as unknown[])
    : [];
  const threads = rawThreads
    .map(mapThread)
    .filter((thread): thread is PrReviewThread => thread !== null)
    .slice(0, PR_CONTEXT_LIMITS.maxThreads);
  const totalThreads =
    typeof threadBlock?.totalCount === "number"
      ? threadBlock.totalCount
      : rawThreads.length;

  // Check runs are commit-scoped, so this stays correct even if the PR head
  // moves between the two calls — the index reports the SHA it actually read.
  const failedChecks: PrCheckFailure[] = [];
  let truncatedFailedChecks = 0;
  let checksStderr = "";
  if (headSha) {
    const checksResult = await run({
      command: "gh",
      commandArgs: [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${ref.owner}/${ref.repo}/commits/${headSha}/check-runs?per_page=100&filter=latest`,
      ],
      cwd: args.cwd,
      maxOutputChars: GH_MAX_OUTPUT_CHARS,
      timeoutMs: GH_TIMEOUT_MS,
    });
    invalidateAuthOnFailure(checksResult, args.cwd);
    if (checksResult.ok) {
      try {
        const parsed = JSON.parse(checksResult.stdout) as Record<
          string,
          unknown
        >;
        const runs = Array.isArray(parsed.check_runs)
          ? (parsed.check_runs as unknown[])
          : [];
        const mapped = runs
          .map(mapCheckRun)
          .filter((check): check is PrCheckFailure => check !== null);
        failedChecks.push(...mapped.slice(0, PR_CONTEXT_LIMITS.maxFailedChecks));
        truncatedFailedChecks = Math.max(
          0,
          mapped.length - failedChecks.length,
        );
      } catch {
        checksStderr = "Could not read the check-run response.";
      }
    } else {
      checksStderr = describeGhFailure(checksResult);
    }
  }

  const index: PrContextIndex = {
    ref: {
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      url:
        asPlainString(pullRequest.url, PR_CONTEXT_LIMITS.maxUrlChars) ||
        `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
    },
    title: asPlainString(pullRequest.title, PR_CONTEXT_LIMITS.maxNameChars),
    headSha,
    fetchedAt: new Date(args.now?.() ?? Date.now()).toISOString(),
    threads,
    truncatedThreads: Math.max(0, totalThreads - threads.length),
    failedChecks,
    truncatedFailedChecks,
  };

  return { ok: true, index, stderr: checksStderr };
}

// ---------------------------------------------------------------------------
// Log excerpts — only for explicitly selected failed checks
// ---------------------------------------------------------------------------

function parseJobRef(
  detailsUrl: string,
): { runId: string; jobId: string } | null {
  const match = /\/actions\/runs\/(\d{1,20})\/job\/(\d{1,20})/.exec(detailsUrl);
  return match ? { runId: match[1], jobId: match[2] } : null;
}

function formatAnnotations(raw: unknown[]): string {
  const lines: string[] = [];
  for (const entry of raw.slice(0, PR_CONTEXT_LIMITS.maxAnnotations)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const node = entry as Record<string, unknown>;
    const level =
      typeof node.annotation_level === "string" ? node.annotation_level : "";
    const path = asPlainString(node.path, PR_CONTEXT_LIMITS.maxPathChars);
    const start =
      typeof node.start_line === "number" ? Math.trunc(node.start_line) : null;
    const title = asPlainString(node.title, PR_CONTEXT_LIMITS.maxNameChars);
    const message = asString(
      node.message,
      PR_CONTEXT_LIMITS.maxAnnotationChars,
    );
    const location = path ? `${path}${start === null ? "" : `:${start}`}` : "";
    lines.push(
      [
        `[${level || "annotation"}]`,
        location,
        title ? `— ${title}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    if (message) {
      lines.push(...message.split("\n").map((line) => `  ${line}`));
    }
  }
  return lines.join("\n");
}

async function fetchOneCheckLog(args: {
  run: RunCommand;
  cwd?: string;
  owner: string;
  repo: string;
  check: PrCheckFailure;
}): Promise<PrCheckLogExcerpt> {
  const base: Omit<PrCheckLogExcerpt, "source" | "excerpt" | "note"> = {
    checkId: args.check.id,
    checkName: args.check.name,
  };

  // 1. Annotations. Small, structured, and usually the actual failure.
  if (args.check.annotationCount > 0) {
    const result = await args.run({
      command: "gh",
      commandArgs: [
        "api",
        "-H",
        "Accept: application/vnd.github+json",
        `repos/${args.owner}/${args.repo}/check-runs/${args.check.id}/annotations?per_page=${PR_CONTEXT_LIMITS.maxAnnotations}`,
      ],
      cwd: args.cwd,
      maxOutputChars: GH_MAX_OUTPUT_CHARS,
      timeoutMs: GH_TIMEOUT_MS,
    });
    invalidateAuthOnFailure(result, args.cwd);
    if (result.ok) {
      try {
        const parsed = JSON.parse(result.stdout);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const excerpt = formatAnnotations(parsed);
          if (excerpt.trim()) {
            return {
              ...base,
              source: "annotations",
              excerpt,
              note:
                parsed.length > PR_CONTEXT_LIMITS.maxAnnotations
                  ? `${parsed.length - PR_CONTEXT_LIMITS.maxAnnotations} further annotations omitted.`
                  : "",
            };
          }
        }
      } catch {
        // Fall through to the log tail.
      }
    }
  }

  // 2. Job log tail. `detailsUrl` is only ever mined for two digit runs, so a
  //    hostile URL cannot reach argv as anything but numbers.
  const jobRef = parseJobRef(args.check.detailsUrl);
  if (!jobRef) {
    return {
      ...base,
      source: "unavailable",
      excerpt: "",
      note: "This check has no GitHub Actions job log and produced no annotations.",
    };
  }
  const logResult = await args.run({
    command: "gh",
    commandArgs: [
      "run",
      "view",
      "--repo",
      `${args.owner}/${args.repo}`,
      "--job",
      jobRef.jobId,
      "--log",
    ],
    cwd: args.cwd,
    maxOutputChars: GH_MAX_OUTPUT_CHARS,
    timeoutMs: GH_TIMEOUT_MS,
  });
  invalidateAuthOnFailure(logResult, args.cwd);
  if (!logResult.ok) {
    return {
      ...base,
      source: "unavailable",
      excerpt: "",
      note: describeGhFailure(logResult),
    };
  }
  const excerpt = sanitizePrContextLogTail(
    logResult.stdout,
    PR_CONTEXT_LIMITS.maxLogTailChars,
  );
  return {
    ...base,
    source: excerpt ? "log-tail" : "unavailable",
    excerpt,
    note: excerpt ? "" : "The job log was empty.",
  };
}

export async function fetchPrCheckLogs(args: {
  cwd?: string;
  prUrl: string;
  headSha: string;
  checkIds: number[];
  runCommand?: RunCommand;
}): Promise<HostPrCheckLogsResult> {
  const run = args.runCommand ?? runCommandArgs;
  const ref = parsePrContextUrl(args.prUrl);
  if (!ref) {
    return { ok: false, excerpts: [], stderr: "Not a GitHub pull request URL." };
  }
  const requested = [...new Set(args.checkIds)]
    .filter((id) => Number.isSafeInteger(id) && id >= 0)
    .slice(0, PR_CONTEXT_LIMITS.maxSelectedChecks);
  if (requested.length === 0) {
    return { ok: true, excerpts: [], stderr: "" };
  }
  if (!/^[0-9a-f]{7,64}$/i.test(args.headSha)) {
    return { ok: false, excerpts: [], stderr: "Invalid head commit." };
  }

  const auth = await ensureGhAuth({ cwd: args.cwd, runCommand: run });
  if (!auth.ok) {
    return { ok: false, excerpts: [], stderr: describeGhFailure(auth) };
  }

  // Re-read the check list server-side rather than trusting renderer-supplied
  // names or URLs. The only thing the renderer chooses is which ids to include.
  const checksResult = await run({
    command: "gh",
    commandArgs: [
      "api",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${ref.owner}/${ref.repo}/commits/${args.headSha}/check-runs?per_page=100&filter=latest`,
    ],
    cwd: args.cwd,
    maxOutputChars: GH_MAX_OUTPUT_CHARS,
    timeoutMs: GH_TIMEOUT_MS,
  });
  invalidateAuthOnFailure(checksResult, args.cwd);
  if (!checksResult.ok) {
    return { ok: false, excerpts: [], stderr: describeGhFailure(checksResult) };
  }

  let checks: PrCheckFailure[] = [];
  try {
    const parsed = JSON.parse(checksResult.stdout) as Record<string, unknown>;
    const runs = Array.isArray(parsed.check_runs)
      ? (parsed.check_runs as unknown[])
      : [];
    checks = runs
      .map(mapCheckRun)
      .filter((check): check is PrCheckFailure => check !== null);
  } catch {
    return {
      ok: false,
      excerpts: [],
      stderr: "Could not read the check-run response.",
    };
  }

  const byId = new Map(checks.map((check) => [check.id, check]));
  const excerpts: PrCheckLogExcerpt[] = [];
  for (const id of requested) {
    const check = byId.get(id);
    if (!check) {
      excerpts.push({
        checkId: id,
        checkName: "",
        source: "unavailable",
        excerpt: "",
        note: "This check is no longer reported as failed for that commit.",
      });
      continue;
    }
    excerpts.push(
      await fetchOneCheckLog({
        run,
        cwd: args.cwd,
        owner: ref.owner,
        repo: ref.repo,
        check,
      }),
    );
  }

  return { ok: true, excerpts, stderr: "" };
}
