import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  SandboxMode,
  ApprovalMode,
  ModelReasoningEffort,
} from "@openai/codex-sdk";
import { parseWorktreePathByBranch } from "../src/lib/source-control-worktrees";
import {
  buildSourceControlDiffPreview,
  resolveSourceControlDiffPaths,
} from "../src/lib/source-control-diff";
import {
  hasSourceControlConflicts,
  parseSourceControlStatusLines,
} from "../src/lib/source-control-status";
import type { BridgeEvent } from "../electron/providers/types";
import { streamClaudeWithSdk } from "../electron/providers/claude-sdk-runtime";
import { streamCodexWithSdk } from "../electron/providers/codex-sdk-runtime";

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

interface ProviderRuntimeOptions {
  codexSandboxMode?: SandboxMode;
  codexApprovalPolicy?: ApprovalMode;
  codexNetworkAccessEnabled?: boolean;
  codexPathOverride?: string;
  codexModelReasoningEffort?: ModelReasoningEffort;
}

interface ProviderTurnRequest {
  providerId: ProviderId;
  prompt: string;
  taskId?: string;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}

const terminalSessions = new Map<string, TerminalSession>();
const activeProviderAborters = new Map<ProviderId, () => void>();
const activeApprovalResponders = new Map<
  ProviderId,
  (args: { requestId: string; approved: boolean }) => boolean
>();
const activeUserInputResponders = new Map<
  ProviderId,
  (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => boolean
>();

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

async function runCommand(args: {
  cmd: string;
  cwd?: string;
}): Promise<CommandResult> {
  const proc = Bun.spawn(["/usr/bin/env", "bash", "-lc", args.cmd], {
    cwd: args.cwd,
    stderr: "pipe",
    stdout: "pipe",
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

    if (url.pathname === "/api/provider/turn" && req.method === "POST") {
      const body = await readJson<ProviderTurnRequest>(req);
      const events: BridgeEvent[] = [];

      // Browser-dev provider bridge: reuse the same SDK-first runtime modules as Electron.
      if (body.providerId === "claude-code") {
        const result = await streamClaudeWithSdk({
          providerId: body.providerId,
          prompt: body.prompt,
          taskId: body.taskId,
          cwd: body.cwd,
          runtimeOptions: body.runtimeOptions,
          onEvent: (event) => {
            events.push(event);
          },
          registerAbort: (aborter) => {
            activeProviderAborters.set(body.providerId, aborter);
          },
          registerApprovalResponder: (responder) => {
            activeApprovalResponders.set(body.providerId, responder);
          },
          registerUserInputResponder: (responder) => {
            activeUserInputResponders.set(body.providerId, responder);
          },
        });
        activeProviderAborters.delete(body.providerId);
        activeApprovalResponders.delete(body.providerId);
        activeUserInputResponders.delete(body.providerId);
        return json({ events: result ?? events });
      }

      const result = await streamCodexWithSdk({
        providerId: body.providerId,
        prompt: body.prompt,
        taskId: body.taskId,
        cwd: body.cwd,
        runtimeOptions: body.runtimeOptions,
        onEvent: (event) => {
          events.push(event);
        },
        registerAbort: (aborter) => {
          activeProviderAborters.set(body.providerId, aborter);
        },
      });
      activeProviderAborters.delete(body.providerId);
      return json({ events: result ?? events });
    }

    if (url.pathname === "/api/provider/abort" && req.method === "POST") {
      const body = await readJson<{ providerId: ProviderId }>(req);
      const aborter = activeProviderAborters.get(body.providerId);
      if (aborter) {
        aborter();
        activeProviderAborters.delete(body.providerId);
        activeApprovalResponders.delete(body.providerId);
        activeUserInputResponders.delete(body.providerId);
        return json({ ok: true, message: "Provider turn aborted." });
      }
      return json({ ok: false, message: "No active provider turn." }, 404);
    }

    if (url.pathname === "/api/provider/approval" && req.method === "POST") {
      const body = await readJson<{
        providerId: ProviderId;
        requestId: string;
        approved: boolean;
      }>(req);
      const responder = activeApprovalResponders.get(body.providerId);
      if (!responder) {
        return json({
          ok: false,
          message: `No active approval responder for ${body.providerId}. requestId=${body.requestId}`,
        });
      }
      const delivered = responder({
        requestId: body.requestId,
        approved: body.approved,
      });
      return json({
        ok: delivered,
        message: delivered
          ? `Approval response delivered to ${body.providerId}. requestId=${body.requestId}`
          : `Approval responder rejected request for ${body.providerId}. requestId=${body.requestId}`,
      });
    }

    if (url.pathname === "/api/provider/user-input" && req.method === "POST") {
      const body = await readJson<{
        providerId: ProviderId;
        requestId: string;
        answers?: Record<string, string>;
        denied?: boolean;
      }>(req);
      const responder = activeUserInputResponders.get(body.providerId);
      if (!responder) {
        return json({
          ok: false,
          message: `No active user-input responder for ${body.providerId}. requestId=${body.requestId}`,
        });
      }
      const delivered = responder({
        requestId: body.requestId,
        answers: body.answers,
        denied: body.denied,
      });
      return json({
        ok: delivered,
        message: delivered
          ? `User-input response delivered to ${body.providerId}. requestId=${body.requestId}`
          : `User-input responder rejected request for ${body.providerId}. requestId=${body.requestId}`,
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
      const refreshResult = await runCommand({
        cmd: body.refreshRemote
          ? "git fetch --all --prune"
          : "git remote prune origin",
        cwd: body.cwd,
      });
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

    if (url.pathname === "/api/scm/branch-create" && req.method === "POST") {
      const body = await readJson<{
        cwd?: string;
        name: string;
        from?: string;
      }>(req);
      const branchName = body.name.trim();
      if (!branchName) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Branch name is required.",
          },
          400,
        );
      }
      const fromRef = body.from?.trim();
      const command = fromRef
        ? `git branch ${JSON.stringify(branchName)} ${JSON.stringify(fromRef)}`
        : `git branch ${JSON.stringify(branchName)}`;
      return json(await runCommand({ cmd: command, cwd: body.cwd }));
    }

    if (url.pathname === "/api/scm/branch-checkout" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; name: string }>(req);
      const branchName = body.name.trim();
      if (!branchName) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Branch name is required.",
          },
          400,
        );
      }
      return json(
        await runCommand({
          cmd: `git checkout ${JSON.stringify(branchName)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/branch-merge" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch: string }>(req);
      const branchName = body.branch.trim();
      if (!branchName) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Branch name is required.",
          },
          400,
        );
      }
      return json(
        await runCommand({
          cmd: `git merge ${JSON.stringify(branchName)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/branch-rebase" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; branch: string }>(req);
      const branchName = body.branch.trim();
      if (!branchName) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Branch name is required.",
          },
          400,
        );
      }
      return json(
        await runCommand({
          cmd: `git rebase ${JSON.stringify(branchName)}`,
          cwd: body.cwd,
        }),
      );
    }

    if (url.pathname === "/api/scm/cherry-pick" && req.method === "POST") {
      const body = await readJson<{ cwd?: string; commit: string }>(req);
      const commit = body.commit.trim();
      if (!commit) {
        return json(
          {
            ok: false,
            code: -1,
            stdout: "",
            stderr: "Commit hash is required.",
          },
          400,
        );
      }
      return json(
        await runCommand({
          cmd: `git cherry-pick ${JSON.stringify(commit)}`,
          cwd: body.cwd,
        }),
      );
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
      const proc = Bun.spawn([shell], {
        cwd: body.cwd || body.workspacePath,
        stderr: "pipe",
        stdout: "pipe",
        stdin: "pipe",
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
        proc = Bun.spawn([command], {
          cwd: body.cwd || body.workspacePath,
          stderr: "pipe",
          stdout: "pipe",
          stdin: "pipe",
          env: {
            ...process.env,
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
