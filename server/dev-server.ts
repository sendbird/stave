import { randomUUID } from "node:crypto";
import path from "node:path";
import { parseWorktreePathByBranch } from "../src/lib/source-control-worktrees";
import {
  buildSourceControlDiffPreview,
  resolveSourceControlDiffPaths,
} from "../src/lib/source-control-diff";
import {
  hasSourceControlConflicts,
  parseSourceControlStatusLines,
} from "../src/lib/source-control-status";
import type {
  BridgeEvent,
  ProviderResponderResult,
} from "../electron/providers/types";
import type {
  CanonicalConversationRequest,
  ProviderRuntimeOptions,
} from "../src/lib/providers/provider.types";
import { streamClaudeWithSdk } from "../electron/providers/claude-sdk-runtime";
import { streamCodexWithAppServer } from "../electron/providers/codex-app-server-runtime";
import {
  appendAdvisorAdvice,
  withoutAdvisorTarget,
} from "../src/lib/providers/advisor";
import {
  createAdvisorUsageMerger,
  formatAdvisorSystemTrace,
  runAdvisorPreflight,
} from "../electron/providers/advisor-runtime";
import { buildProjectShellEnv } from "../electron/shared/project-node-env";
import {
  checkoutDefaultBranchDetached,
  checkoutScmBranch,
  cherryPickScmCommit,
  createScmBranch,
  createScmTag,
  deleteScmBranch,
  deleteScmTag,
  fetchScmBranch,
  getScmCommitDetails,
  getScmCommitDiff,
  getScmCommitFiles,
  getScmGraph,
  mergeScmBranch,
  pullScmBranch,
  pushScmBranch,
  rebaseScmBranch,
  renameScmBranch,
  resetScmCommit,
  revertScmCommit,
} from "../electron/host-service/scm-runtime";
import {
  ScmCommitDetailsArgsSchema,
  ScmCommitDiffArgsSchema,
  ScmCommitFilesArgsSchema,
  ScmGraphArgsSchema,
} from "../electron/main/ipc/schemas";

// Browser-only development bridge.
// This is not the primary desktop runtime; it exists so `bun run dev` / `bun run dev:all`
// can exercise provider, terminal, and source-control flows without launching Electron.
const port = Number(process.env.PORT ?? 3001);

type ProviderId = "claude-code" | "codex";

interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

interface TerminalSession {
  process: Bun.Subprocess;
  output: string;
}

interface ProviderTurnRequest {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

const terminalSessions = new Map<string, TerminalSession>();
const activeProviderAborters = new Map<string, () => void>();
const activeApprovalResponders = new Map<
  string,
  (args: { requestId: string; approved: boolean }) => ProviderResponderResult
>();
const activeUserInputResponders = new Map<
  string,
  (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => ProviderResponderResult
>();

// The browser-dev client (vite on another port) calls this bridge cross-origin,
// so every response needs permissive CORS headers for local development.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function isResponderDelivered(result: ProviderResponderResult) {
  return result.ok;
}

async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

async function runCommand(args: {
  cmd: string;
  cwd?: string;
}): Promise<CommandResult> {
  try {
    const cwd = args.cwd || process.cwd();
    const proc = Bun.spawn(["/usr/bin/env", "bash", "-lc", args.cmd], {
      cwd,
      stderr: "pipe",
      stdout: "pipe",
      env: buildProjectShellEnv({ cwd, baseEnv: process.env }),
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return {
      ok: code === 0,
      code,
      stdout,
      stderr,
    };
  } catch (error) {
    // Bun.spawn throws synchronously (e.g. ENOENT for a missing cwd). A thrown
    // handler makes Bun return an error page without CORS headers, which the
    // browser surfaces as an opaque "Failed to fetch". Return a normal command
    // failure instead so the dev bridge client degrades gracefully.
    return {
      ok: false,
      code: -1,
      stdout: "",
      stderr: String(error),
    };
  }
}

function hasConflictItems(args: {
  items: Array<{
    code: string;
    path: string;
    indexStatus?: string;
    workingTreeStatus?: string;
  }>;
}) {
  return args.items.some((item) => hasSourceControlConflicts({ item }));
}

function toGitPathspecArg(paths: string[]) {
  return paths.map((filePath) => JSON.stringify(filePath)).join(" ");
}

async function readGitHeadFile(args: { cwd?: string; filePath: string }) {
  const result = await runCommand({
    cmd: `git show HEAD:${JSON.stringify(args.filePath)}`,
    cwd: args.cwd,
  });
  return result.ok ? result.stdout : "";
}

async function readWorkingTreeFile(args: { cwd?: string; filePath: string }) {
  const rootPath = path.resolve(args.cwd ?? process.cwd());
  const absolutePath = path.resolve(rootPath, args.filePath);
  const relative = path.relative(rootPath, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return "";
  }

  const file = Bun.file(absolutePath);
  if (!(await file.exists())) {
    return "";
  }

  try {
    return await file.text();
  } catch {
    return "";
  }
}

async function discardSourceControlPath(args: { cwd?: string; path: string }) {
  const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
  const pathspecArg = toGitPathspecArg(paths.pathspecs);
  const restoreResult = await runCommand({
    cmd: `git restore -- ${pathspecArg}`,
    cwd: args.cwd,
  });

  if (restoreResult.ok) {
    return restoreResult;
  }

  const cleanResult = await runCommand({
    cmd: `git clean -f -- ${pathspecArg}`,
    cwd: args.cwd,
  });
  if (cleanResult.ok) {
    return cleanResult;
  }

  return {
    ok: false,
    code: cleanResult.code,
    stdout: [restoreResult.stdout, cleanResult.stdout]
      .filter(Boolean)
      .join("\n"),
    stderr: [restoreResult.stderr, cleanResult.stderr]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

const server = Bun.serve({
  port,
  routes: {
    "/health": () => json({ ok: true, service: "stave-dev-server" }),
  },
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/provider/turn" && req.method === "POST") {
      const body = await readJson<ProviderTurnRequest>(req);
      const turnKey = body.turnId?.trim() || body.providerId;
      const events: BridgeEvent[] = [];
      let abortRequested = false;
      let activePhaseAborter: (() => void) | null = null;
      let registeredApprovalResponder:
        | ((args: {
            requestId: string;
            approved: boolean;
          }) => ProviderResponderResult)
        | null = null;
      let registeredUserInputResponder:
        | ((args: {
            requestId: string;
            answers?: Record<string, string>;
            denied?: boolean;
          }) => ProviderResponderResult)
        | null = null;
      const abortTurn = () => {
        if (abortRequested) {
          return;
        }
        abortRequested = true;
        activePhaseAborter?.();
      };
      const registerPhaseAborter = (aborter: () => void) => {
        activePhaseAborter = aborter;
        if (abortRequested) {
          aborter();
        }
      };
      const registerApprovalResponder = (
        responder: NonNullable<typeof registeredApprovalResponder>,
      ) => {
        if (abortRequested) {
          return;
        }
        registeredApprovalResponder = responder;
        activeApprovalResponders.set(turnKey, responder);
      };
      const registerUserInputResponder = (
        responder: NonNullable<typeof registeredUserInputResponder>,
      ) => {
        if (abortRequested) {
          return;
        }
        registeredUserInputResponder = responder;
        activeUserInputResponders.set(turnKey, responder);
      };
      const cleanupTurn = () => {
        if (activeProviderAborters.get(turnKey) === abortTurn) {
          activeProviderAborters.delete(turnKey);
        }
        if (
          registeredApprovalResponder &&
          activeApprovalResponders.get(turnKey) === registeredApprovalResponder
        ) {
          activeApprovalResponders.delete(turnKey);
        }
        if (
          registeredUserInputResponder &&
          activeUserInputResponders.get(turnKey) ===
            registeredUserInputResponder
        ) {
          activeUserInputResponders.delete(turnKey);
        }
      };
      activeProviderAborters.set(turnKey, abortTurn);
      let effectiveBody: ProviderTurnRequest = {
        ...body,
        runtimeOptions: withoutAdvisorTarget(body.runtimeOptions),
      };
      let advisorUsage: Extract<BridgeEvent, { type: "usage" }> | undefined;

      try {
        if (body.runtimeOptions?.advisorTarget) {
          const advisorResult = await runAdvisorPreflight({
            turn: body,
            registerAbort: registerPhaseAborter,
          });
          if (advisorResult.status === "aborted" || abortRequested) {
            const done: BridgeEvent = {
              type: "done",
              stop_reason: "user_abort",
            };
            return json({
              events: createAdvisorUsageMerger(advisorResult.usage)(done),
            });
          }
          if (advisorResult.shouldTrace) {
            events.push({
              type: "system",
              content: formatAdvisorSystemTrace(advisorResult),
            });
          }
          advisorUsage = advisorResult.usage;
          if (
            advisorResult.status === "completed" &&
            effectiveBody.conversation
          ) {
            effectiveBody = {
              ...effectiveBody,
              conversation: appendAdvisorAdvice({
                conversation: effectiveBody.conversation,
                target: advisorResult.target,
                advice: advisorResult.advice,
              }),
            };
          }
        }
        const primaryEvents: BridgeEvent[] = [];
        const collectEvent = (event: BridgeEvent) => {
          primaryEvents.push(event);
        };
        const respondWithPrimaryEvents = (
          returnedEvents: BridgeEvent[] | null,
        ) => {
          const mapUsage = createAdvisorUsageMerger(advisorUsage);
          events.push(
            ...(returnedEvents ?? primaryEvents).flatMap((event) =>
              mapUsage(event),
            ),
          );
          return json({ events });
        };

        // Browser-dev provider bridge: reuse the same SDK-first runtime modules as Electron.
        if (effectiveBody.providerId === "claude-code") {
          const result = await streamClaudeWithSdk({
            ...effectiveBody,
            onEvent: collectEvent,
            registerAbort: registerPhaseAborter,
            registerApprovalResponder,
            registerUserInputResponder,
          });
          return respondWithPrimaryEvents(result);
        }

        const result = await streamCodexWithAppServer({
          ...effectiveBody,
          onEvent: collectEvent,
          registerAbort: registerPhaseAborter,
          registerApprovalResponder,
          registerUserInputResponder,
        });
        return respondWithPrimaryEvents(result);
      } finally {
        cleanupTurn();
      }
    }

    if (url.pathname === "/api/provider/abort" && req.method === "POST") {
      const body = await readJson<{
        turnId?: string;
        providerId?: ProviderId;
      }>(req);
      const turnKey = body.turnId?.trim() || body.providerId;
      const aborter = turnKey ? activeProviderAborters.get(turnKey) : undefined;
      if (aborter) {
        aborter();
        activeProviderAborters.delete(turnKey!);
        activeApprovalResponders.delete(turnKey!);
        activeUserInputResponders.delete(turnKey!);
        return json({ ok: true, message: "Provider turn aborted." });
      }
      return json({ ok: false, message: "No active provider turn." }, 404);
    }

    if (url.pathname === "/api/provider/approval" && req.method === "POST") {
      const body = await readJson<{
        turnId?: string;
        providerId?: ProviderId;
        requestId: string;
        approved: boolean;
      }>(req);
      const turnKey = body.turnId?.trim() || body.providerId;
      const responder = turnKey
        ? activeApprovalResponders.get(turnKey)
        : undefined;
      if (!responder) {
        return json({
          ok: false,
          message: `No active approval responder for ${turnKey ?? "<unknown-turn>"}. requestId=${body.requestId}`,
        });
      }
      const delivered = isResponderDelivered(
        responder({
          requestId: body.requestId,
          approved: body.approved,
        }),
      );
      return json({
        ok: delivered,
        message: delivered
          ? `Approval response delivered to ${turnKey}. requestId=${body.requestId}`
          : `Approval responder rejected request for ${turnKey}. requestId=${body.requestId}`,
      });
    }

    if (url.pathname === "/api/provider/user-input" && req.method === "POST") {
      const body = await readJson<{
        turnId?: string;
        providerId?: ProviderId;
        requestId: string;
        answers?: Record<string, string>;
        denied?: boolean;
      }>(req);
      const turnKey = body.turnId?.trim() || body.providerId;
      const responder = turnKey
        ? activeUserInputResponders.get(turnKey)
        : undefined;
      if (!responder) {
        return json({
          ok: false,
          message: `No active user-input responder for ${turnKey ?? "<unknown-turn>"}. requestId=${body.requestId}`,
        });
      }
      const delivered = isResponderDelivered(
        responder({
          requestId: body.requestId,
          answers: body.answers,
          denied: body.denied,
        }),
      );
      return json({
        ok: delivered,
        message: delivered
          ? `User-input response delivered to ${turnKey}. requestId=${body.requestId}`
          : `User-input responder rejected request for ${turnKey}. requestId=${body.requestId}`,
      });
    }

    if (url.pathname === "/api/provider/check" && req.method === "POST") {
      const body = await readJson<{ providerId: ProviderId }>(req);
      const command =
        body.providerId === "claude-code"
          ? "claude --version"
          : "codex --version";
      const result = await runCommand({ cmd: command });
      return json({
        ok: true,
        available: result.ok,
        detail: [result.stdout.trim(), result.stderr.trim()]
          .filter(Boolean)
          .join("\n"),
      });
    }

    if (url.pathname === "/api/scm/status" && req.method === "POST") {
      const body = await readJson<{ cwd?: string }>(req);
      const [statusResult, branchResult] = await Promise.all([
        runCommand({ cmd: "git status --porcelain", cwd: body.cwd }),
        runCommand({ cmd: "git rev-parse --abbrev-ref HEAD", cwd: body.cwd }),
      ]);
      const items = statusResult.ok
        ? parseSourceControlStatusLines({ stdout: statusResult.stdout })
        : [];
      return json({
        ok: statusResult.ok && branchResult.ok,
        branch: branchResult.ok ? branchResult.stdout.trim() : "unknown",
        items,
        hasConflicts: hasConflictItems({ items }),
        stderr: [statusResult.stderr, branchResult.stderr]
          .filter(Boolean)
          .join("\n")
          .trim(),
      });
    }

    if (url.pathname === "/api/scm/stage-all" && req.method === "POST") {
      const body = await readJson<{ cwd?: string }>(req);
      return json(await runCommand({ cmd: "git add -A", cwd: body.cwd }));
    }

    if (url.pathname === "/api/scm/unstage-all" && req.method === "POST") {
      const body = await readJson<{ cwd?: string }>(req);
      return json(
        await runCommand({ cmd: "git restore --staged .", cwd: body.cwd }),
      );
    }

    if (url.pathname === "/api/scm/commit" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; message: string }>(req);
      const msg = body.message.trim();
      if (!msg) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Commit message is required.",
          },
          400,
        );
      }
      return json(
        await runCommand({
          cmd: `git commit -m ${JSON.stringify(msg)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/stage-file" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; path: string }>(req);
      const paths = resolveSourceControlDiffPaths({ rawPath: body.path });
      return json(
        await runCommand({
          cmd: `git add -- ${toGitPathspecArg(paths.pathspecs)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/unstage-file" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; path: string }>(req);
      const paths = resolveSourceControlDiffPaths({ rawPath: body.path });
      return json(
        await runCommand({
          cmd: `git restore --staged -- ${toGitPathspecArg(paths.pathspecs)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/discard-file" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; path: string }>(req);
      return json(
        await discardSourceControlPath({ path: body.path, cwd: body.cwd }),
      );
    }

    if (url.pathname === "/api/scm/diff" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; path: string }>(req);
      const paths = resolveSourceControlDiffPaths({ rawPath: body.path });
      const pathspecArg = toGitPathspecArg(paths.pathspecs);
      const [staged, unstaged, oldContent, newContent] = await Promise.all([
        runCommand({
          cmd: `git diff --cached -- ${pathspecArg}`,
          cwd: body.cwd,
        }),
        runCommand({ cmd: `git diff -- ${pathspecArg}`, cwd: body.cwd }),
        readGitHeadFile({ cwd: body.cwd, filePath: paths.headPath }),
        readWorkingTreeFile({ cwd: body.cwd, filePath: paths.workingTreePath }),
      ]);
      const content = buildSourceControlDiffPreview({
        stagedPatch: staged.stdout,
        unstagedPatch: unstaged.stdout,
      });
      return json({
        ok: staged.ok || unstaged.ok,
        content,
        oldContent,
        newContent,
        stderr: [staged.stderr, unstaged.stderr]
          .filter(Boolean)
          .join("\n")
          .trim(),
      });
    }

    if (url.pathname === "/api/scm/graph" && req.method === "POST") {
      const parsed = ScmGraphArgsSchema.safeParse(await readJson<unknown>(req));
      if (!parsed.success) {
        return json(
          {
            ok: false,
            commits: [],
            head: null,
            headHash: null,
            availableRefs: [],
            workingTree: {
              staged: 0,
              unstaged: 0,
              untracked: 0,
              conflicts: 0,
            },
            workingTreeAvailable: false,
            worktreePathByBranch: {},
            worktreePathsAvailable: false,
            hasMore: false,
            stderr: "Invalid git graph request.",
          },
          400,
        );
      }
      return json(await getScmGraph(parsed.data));
    }

    if (url.pathname === "/api/scm/commit-details" && req.method === "POST") {
      const parsed = ScmCommitDetailsArgsSchema.safeParse(
        await readJson<unknown>(req),
      );
      if (!parsed.success) {
        return json(
          {
            ok: false,
            details: null,
            stderr: "Invalid commit details request.",
          },
          400,
        );
      }
      return json(await getScmCommitDetails(parsed.data));
    }

    if (url.pathname === "/api/scm/commit-files" && req.method === "POST") {
      const parsed = ScmCommitFilesArgsSchema.safeParse(
        await readJson<unknown>(req),
      );
      if (!parsed.success) {
        return json(
          {
            ok: false,
            files: [],
            stderr: "Invalid commit files request.",
          },
          400,
        );
      }
      return json(await getScmCommitFiles(parsed.data));
    }

    if (url.pathname === "/api/scm/commit-diff" && req.method === "POST") {
      const parsed = ScmCommitDiffArgsSchema.safeParse(
        await readJson<unknown>(req),
      );
      if (!parsed.success) {
        return json(
          {
            ok: false,
            oldContent: "",
            newContent: "",
            stderr: "Invalid commit diff request.",
          },
          400,
        );
      }
      return json(await getScmCommitDiff(parsed.data));
    }

    if (url.pathname === "/api/scm/history" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; limit?: number }>(req);
      const limit = Math.max(1, Math.min(50, body.limit ?? 20));
      const result = await runCommand({
        cmd: `git log -n ${limit} --pretty=format:%h%x09%ad%x09%s --date=relative`,
        cwd: body.cwd,
      });
      return json({
        ok: result.ok,
        items: result.ok
          ? result.stdout
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const [hash = "", relativeDate = "", subject = ""] =
                  line.split("\t");
                return { hash, relativeDate, subject };
              })
          : [],
        stderr: result.stderr,
      });
    }

    if (url.pathname === "/api/scm/branches" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; refreshRemote?: boolean }>(
        req,
      );
      const refreshResult = body.refreshRemote
        ? await runCommand({
            cmd: "git fetch --all --prune",
            cwd: body.cwd,
          })
        : { ok: true, code: 0, stdout: "", stderr: "" };
      const [result, remoteResult, currentResult, worktreeResult] =
        await Promise.all([
          runCommand({
            cmd: "git branch --format='%(refname:short)|%(upstream:track)'",
            cwd: body.cwd,
          }),
          runCommand({
            cmd: "git branch -r --format='%(refname:short)'",
            cwd: body.cwd,
          }),
          runCommand({
            cmd: "git rev-parse --abbrev-ref HEAD",
            cwd: body.cwd,
          }),
          runCommand({
            cmd: "git worktree list --porcelain",
            cwd: body.cwd,
          }),
        ]);
      return json({
        ok: result.ok && currentResult.ok,
        current: currentResult.ok ? currentResult.stdout.trim() : "unknown",
        branches: result.ok
          ? result.stdout
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .filter((line) => !line.endsWith("|[gone]"))
              .map((line) => line.split("|")[0] ?? line)
          : [],
        remoteBranches: remoteResult.ok
          ? remoteResult.stdout
              .split("\n")
              .map((name) => name.trim())
              .filter(
                (name) =>
                  Boolean(name) &&
                  name.includes("/") &&
                  !name.endsWith("/HEAD"),
              )
          : [],
        worktreePathByBranch: worktreeResult.ok
          ? parseWorktreePathByBranch({ stdout: worktreeResult.stdout })
          : {},
        stderr: [refreshResult.stderr, result.stderr, currentResult.stderr]
          .filter(Boolean)
          .join("\n")
          .trim(),
      });
    }

    if (url.pathname === "/api/scm/fetch" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch?: string }>(req);
      return json(await fetchScmBranch(body));
    }

    if (url.pathname === "/api/scm/pull" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch?: string }>(req);
      return json(await pullScmBranch(body));
    }

    if (url.pathname === "/api/scm/branch-create" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        name: string;
        from?: string;
      }>(req);
      return json(await createScmBranch(body));
    }

    if (url.pathname === "/api/scm/branch-checkout" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; name: string }>(req);
      return json(await checkoutScmBranch(body));
    }

    if (
      url.pathname === "/api/scm/branch-checkout-default-detached" &&
      req.method === "POST"
    ) {
      const body = await readJson<{ cwd?: string }>(req);
      return json(await checkoutDefaultBranchDetached({ cwd: body.cwd }));
    }

    if (url.pathname === "/api/scm/branch-merge" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch: string }>(req);
      return json(await mergeScmBranch(body));
    }

    if (url.pathname === "/api/scm/branch-rebase" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch: string }>(req);
      return json(await rebaseScmBranch(body));
    }

    if (url.pathname === "/api/scm/cherry-pick" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; commit: string }>(req);
      return json(await cherryPickScmCommit(body));
    }

    if (url.pathname === "/api/scm/revert" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; commit: string }>(req);
      return json(await revertScmCommit(body));
    }

    if (url.pathname === "/api/scm/reset" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        commit: string;
        mode: "soft" | "mixed" | "hard";
      }>(req);
      return json(await resetScmCommit(body));
    }

    if (url.pathname === "/api/scm/tag-create" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        name: string;
        commit?: string;
        message?: string;
      }>(req);
      return json(await createScmTag(body));
    }

    if (url.pathname === "/api/scm/tag-delete" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; name: string }>(req);
      return json(await deleteScmTag(body));
    }

    if (url.pathname === "/api/scm/branch-rename" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        from: string;
        to: string;
      }>(req);
      return json(await renameScmBranch(body));
    }

    if (url.pathname === "/api/scm/branch-delete" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        name: string;
        force?: boolean;
      }>(req);
      return json(await deleteScmBranch(body));
    }

    if (url.pathname === "/api/scm/push" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        branch?: string;
        remote?: string;
        force?: boolean;
      }>(req);
      return json(await pushScmBranch(body));
    }

    if (url.pathname === "/api/terminal/create" && req.method === "POST") {
      const body = await readJson<{
        workspaceId: string;
        workspacePath: string;
        taskId: string | null;
        taskTitle: string | null;
        terminalTabId: string;
        cwd: string;
        shell?: string;
      }>(req);
      const shell = body.shell?.trim() || process.env.SHELL || "/usr/bin/zsh";
      const cwd = body.cwd || body.workspacePath;
      const proc = Bun.spawn([shell], {
        cwd,
        stderr: "pipe",
        stdout: "pipe",
        stdin: "pipe",
        env: buildProjectShellEnv({ cwd, baseEnv: process.env }),
      });
      const sessionId = randomUUID();
      const session: TerminalSession = { process: proc, output: "" };
      terminalSessions.set(sessionId, session);

      (async () => {
        const reader = proc.stdout?.getReader();
        if (!reader) {
          return;
        }
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const current = terminalSessions.get(sessionId);
          if (!current) {
            break;
          }
          current.output += new TextDecoder().decode(value);
        }
      })();

      (async () => {
        const reader = proc.stderr?.getReader();
        if (!reader) {
          return;
        }
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const current = terminalSessions.get(sessionId);
          if (!current) {
            break;
          }
          current.output += new TextDecoder().decode(value);
        }
      })();

      return json({ ok: true, sessionId });
    }

    if (url.pathname === "/api/terminal/create-cli" && req.method === "POST") {
      const body = await readJson<{
        workspaceId: string;
        workspacePath: string;
        cliSessionTabId: string;
        providerId: ProviderId;
        contextMode: "workspace" | "active-task";
        taskId: string | null;
        taskTitle: string | null;
        cwd: string;
        runtimeOptions?: {
          codexBinaryPath?: string;
        };
      }>(req);
      const command =
        body.providerId === "claude-code"
          ? "claude"
          : body.runtimeOptions?.codexBinaryPath?.trim() || "codex";
      let proc: Bun.Subprocess;

      try {
        const cwd = body.cwd || body.workspacePath;
        proc = Bun.spawn([command], {
          cwd,
          stderr: "pipe",
          stdout: "pipe",
          stdin: "pipe",
          env: {
            ...buildProjectShellEnv({ cwd, baseEnv: process.env }),
            STAVE_WORKSPACE_PATH: body.workspacePath,
            STAVE_TASK_ID: body.taskId ?? "",
            STAVE_TASK_TITLE: body.taskTitle ?? "",
          },
        });
      } catch (error) {
        return json(
          {
            ok: false,
            stderr: `Unable to launch ${body.providerId === "claude-code" ? "Claude" : "Codex"} CLI in the web dev bridge: ${String(error)}`,
          },
          400,
        );
      }

      const sessionId = randomUUID();
      const session: TerminalSession = { process: proc, output: "" };
      terminalSessions.set(sessionId, session);

      (async () => {
        const reader = proc.stdout?.getReader();
        if (!reader) {
          return;
        }
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const current = terminalSessions.get(sessionId);
          if (!current) {
            break;
          }
          current.output += new TextDecoder().decode(value);
        }
      })();

      (async () => {
        const reader = proc.stderr?.getReader();
        if (!reader) {
          return;
        }
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          const current = terminalSessions.get(sessionId);
          if (!current) {
            break;
          }
          current.output += new TextDecoder().decode(value);
        }
      })();

      return json({ ok: true, sessionId });
    }

    if (url.pathname === "/api/terminal/run" && req.method === "POST") {
      const body = await readJson<{ command: string; cwd?: string }>(req);
      return json(await runCommand({ cmd: body.command, cwd: body.cwd }));
    }

    if (url.pathname === "/api/terminal/write" && req.method === "POST") {
      const body = await readJson<{ sessionId: string; input: string }>(req);
      const session = terminalSessions.get(body.sessionId);
      if (!session || !session.process.stdin) {
        return json({ ok: false, stderr: "Terminal session not found." }, 404);
      }
      const writer = session.process.stdin.getWriter();
      await writer.write(new TextEncoder().encode(body.input));
      writer.releaseLock();
      return json({ ok: true });
    }

    if (url.pathname === "/api/terminal/read" && req.method === "POST") {
      const body = await readJson<{ sessionId: string }>(req);
      const session = terminalSessions.get(body.sessionId);
      if (!session) {
        return json(
          { ok: false, output: "", stderr: "Terminal session not found." },
          404,
        );
      }
      const output = session.output;
      session.output = "";
      return json({ ok: true, output });
    }

    if (url.pathname === "/api/terminal/close" && req.method === "POST") {
      const body = await readJson<{ sessionId: string }>(req);
      const session = terminalSessions.get(body.sessionId);
      if (!session) {
        return json({ ok: false, stderr: "Terminal session not found." }, 404);
      }
      session.process.kill();
      terminalSessions.delete(body.sessionId);
      return json({ ok: true });
    }

    return json({ message: "stave dev server", path: url.pathname });
  },
});

console.log(`[server] running on http://localhost:${server.port}`);
