import path from "node:path";
import {
  buildClaudeEnv,
  resolveClaudeExecutablePath,
} from "../../providers/claude-sdk-runtime";
import { resolveCodexExecutablePath } from "../../providers/codex-app-server-runtime";
import { buildCodexCliEnv } from "../../providers/cli-path-env";
import {
  canExecutePath,
  resolveExecutablePath,
} from "../../providers/executable-path";
import { buildRuntimeProcessEnv } from "../../providers/runtime-shared";
import type {
  CodexMcpServerStatusSnapshot,
  CodexMcpStatusResponse,
} from "../../../src/lib/providers/provider.types";
import type {
  SyncOriginMainRequest,
  SyncOriginMainResult,
  ToolingAuthState,
  ToolingStatusEntry,
  ToolingStatusRequest,
  ToolingStatusSnapshot,
  ToolingStatusState,
  WorkspaceSyncStatus,
} from "../../../src/lib/tooling-status";
import {
  parseStatusLines,
  resolveCommandCwd,
  runCommand,
  runCommandArgs,
} from "./command";

const UNUSED_ABSOLUTE_PATH_ENV_VAR = "__STAVE_UNUSED_ABSOLUTE_PATH__";
const UNUSED_COMMAND_ENV_VAR = "__STAVE_UNUSED_COMMAND__";

function firstMeaningfulLine(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function findJsonStart(value: string) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");

  if (objectStart === -1) {
    return arrayStart;
  }
  if (arrayStart === -1) {
    return objectStart;
  }
  return Math.min(objectStart, arrayStart);
}

function summarizeCommandOutput(value: string, maxLines = 6, maxChars = 1_200) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const limitedLines = trimmed
    .split("\n")
    .slice(0, maxLines)
    .join("\n");
  return limitedLines.length > maxChars
    ? `${limitedLines.slice(0, maxChars).trimEnd()}…`
    : limitedLines;
}

function combineCommandDetail(args: { stdout?: string; stderr?: string }) {
  return [
    summarizeCommandOutput(args.stderr ?? ""),
    summarizeCommandOutput(args.stdout ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveSystemExecutablePath(command: string) {
  return resolveExecutablePath({
    absolutePathEnvVar: UNUSED_ABSOLUTE_PATH_ENV_VAR,
    commandEnvVar: UNUSED_COMMAND_ENV_VAR,
    defaultCommand: command,
  }) ?? "";
}

function makeToolEntry(args: {
  id: ToolingStatusEntry["id"];
  label: string;
  state: ToolingStatusState;
  available: boolean;
  summary: string;
  detail: string;
  version: string | null;
  executablePath: string | null;
  authState: ToolingAuthState;
  authDetail?: string | null;
}): ToolingStatusEntry {
  return {
    id: args.id,
    label: args.label,
    state: args.state,
    available: args.available,
    summary: args.summary,
    detail: args.detail,
    version: args.version,
    executablePath: args.executablePath,
    authState: args.authState,
    authDetail: args.authDetail ?? null,
  };
}

export function parseAheadBehindCounts(args: { stdout: string }) {
  const [aheadText = "0", behindText = "0"] = args.stdout.trim().split(/\s+/);
  const ahead = Number.parseInt(aheadText, 10);
  const behind = Number.parseInt(behindText, 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

export function parseGhAuthState(args: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): { authState: ToolingAuthState; authDetail: string | null } {
  const detail = combineCommandDetail(args);
  const combined = `${args.stderr}\n${args.stdout}`.toLowerCase();
  if (args.ok && args.stdout.toLowerCase().includes("logged in to")) {
    return {
      authState: "authenticated",
      authDetail: detail || "GitHub CLI is authenticated.",
    };
  }
  if (
    combined.includes("not logged into")
    || combined.includes("gh auth login")
    || combined.includes("authentication failed")
    || combined.includes("no oauth token")
  ) {
    return {
      authState: "unauthenticated",
      authDetail: detail || "GitHub CLI login is required.",
    };
  }
  return {
    authState: args.ok ? "unknown" : "unauthenticated",
    authDetail: detail || "Unable to determine GitHub CLI authentication state.",
  };
}

export function parseCodexAuthState(args: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): { authState: ToolingAuthState; authDetail: string | null } {
  const detail = combineCommandDetail(args);
  const combined = `${args.stderr}\n${args.stdout}`.toLowerCase();
  if (
    combined.includes("not logged in")
    || combined.includes("codex login")
    || combined.includes("credential")
    || combined.includes("api key")
    || combined.includes("unauthorized")
    || combined.includes("authentication")
  ) {
    return {
      authState: "unauthenticated",
      authDetail: detail || "Codex CLI login is required.",
    };
  }
  if (combined.includes("logged in")) {
    return {
      authState: "authenticated",
      authDetail: detail || "Codex CLI is authenticated.",
    };
  }
  return {
    authState: args.ok ? "unknown" : "unauthenticated",
    authDetail: detail || "Unable to determine Codex CLI authentication state.",
  };
}

export function parseClaudeAuthState(args: {
  ok: boolean;
  stdout: string;
  stderr: string;
}): { authState: ToolingAuthState; authDetail: string | null } {
  const detail = combineCommandDetail(args);
  const jsonCandidates = [
    args.stdout,
    args.stderr,
    `${args.stdout}\n${args.stderr}`,
    `${args.stderr}\n${args.stdout}`,
  ];
  for (const candidate of jsonCandidates) {
    const startIndex = findJsonStart(candidate);
    if (startIndex === -1) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate.slice(startIndex).trim()) as {
        loggedIn?: unknown;
        email?: unknown;
        orgName?: unknown;
      };
      if (typeof parsed.loggedIn === "boolean") {
        const email = typeof parsed.email === "string" ? parsed.email : null;
        const orgName = typeof parsed.orgName === "string" ? parsed.orgName : null;
        const parts = [
          parsed.loggedIn ? "Authenticated" : "Not authenticated",
          email,
          orgName ? `org: ${orgName}` : null,
        ].filter(Boolean);
        return {
          authState: parsed.loggedIn ? "authenticated" : "unauthenticated",
          authDetail: parts.join(" · "),
        };
      }
    } catch {
      // Fall through to heuristic parsing.
    }
  }

  const combined = `${args.stderr}\n${args.stdout}`.toLowerCase();
  if (
    combined.includes("not logged in")
    || combined.includes("claude auth login")
    || combined.includes("authentication failed")
    || combined.includes("unauthorized")
  ) {
    return {
      authState: "unauthenticated",
      authDetail: detail || "Claude CLI login is required.",
    };
  }

  return {
    authState: args.ok ? "unknown" : "unauthenticated",
    authDetail: detail || "Unable to determine Claude CLI authentication state.",
  };
}

function toCodexMcpServerStatusSnapshot(value: unknown): CodexMcpServerStatusSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const transport = record.transport && typeof record.transport === "object" && !Array.isArray(record.transport)
    ? record.transport as Record<string, unknown>
    : null;

  return {
    name: typeof record.name === "string" ? record.name : "unknown",
    enabled: record.enabled === true,
    disabledReason: typeof record.disabled_reason === "string" ? record.disabled_reason : null,
    transportType: typeof transport?.type === "string" ? transport.type : "unknown",
    url: typeof transport?.url === "string" ? transport.url : null,
    bearerTokenEnvVar: typeof transport?.bearer_token_env_var === "string"
      ? transport.bearer_token_env_var
      : null,
    authStatus: typeof record.auth_status === "string" ? record.auth_status : null,
    startupTimeoutSec: typeof record.startup_timeout_sec === "number" ? record.startup_timeout_sec : null,
    toolTimeoutSec: typeof record.tool_timeout_sec === "number" ? record.tool_timeout_sec : null,
  };
}

export function parseCodexMcpServerList(args: {
  stdout: string;
  stderr: string;
}): CodexMcpServerStatusSnapshot[] | null {
  const candidates = [
    args.stdout,
    args.stderr,
    `${args.stdout}\n${args.stderr}`,
    `${args.stderr}\n${args.stdout}`,
  ];

  for (const candidate of candidates) {
    const startIndex = findJsonStart(candidate);
    if (startIndex === -1) {
      continue;
    }

    const jsonText = candidate.slice(startIndex).trim();
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (!Array.isArray(parsed)) {
        continue;
      }
      return parsed
        .map((item) => toCodexMcpServerStatusSnapshot(item))
        .filter((item): item is CodexMcpServerStatusSnapshot => item !== null);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function formatToolSummary(args: {
  label: string;
  available: boolean;
  version: string | null;
  authState: ToolingAuthState;
}) {
  if (!args.available) {
    return `${args.label} is unavailable.`;
  }
  if (args.authState === "authenticated") {
    return args.version ? `${args.version}` : `${args.label} is ready.`;
  }
  if (args.authState === "unauthenticated") {
    return `${args.label} is installed, but login is required.`;
  }
  return args.version ?? `${args.label} responded, but health is uncertain.`;
}

function formatToolDetail(args: {
  executablePath: string | null;
  version: string | null;
  authDetail: string | null;
  extraLines?: string[];
  failureDetail?: string;
  available: boolean;
}) {
  if (!args.available) {
    return [
      args.executablePath ? `Resolved path: ${args.executablePath}` : "",
      ...(args.extraLines ?? []),
      args.failureDetail ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    args.executablePath ? `Resolved path: ${args.executablePath}` : "",
    args.version ? `Version: ${args.version}` : "",
    ...(args.extraLines ?? []),
    args.authDetail ? `Auth: ${args.authDetail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function stateFromAvailability(args: {
  available: boolean;
  authState: ToolingAuthState;
}) {
  if (!args.available) {
    return "error" satisfies ToolingStatusState;
  }
  if (
    args.authState === "unauthenticated"
    || args.authState === "unknown"
  ) {
    return "warning" satisfies ToolingStatusState;
  }
  return "ready" satisfies ToolingStatusState;
}

async function inspectShellStatus() {
  const fallbackShell = process.platform === "win32"
    ? process.env.ComSpec?.trim() || "cmd.exe"
    : process.env.SHELL?.trim() || "/bin/bash";
  const executablePath = fallbackShell || null;
  const available = executablePath
    ? (path.isAbsolute(executablePath)
        ? canExecutePath({ path: executablePath })
        : true)
    : false;

  return makeToolEntry({
    id: "shell",
    label: "Interactive Shell",
    state: available ? "ready" : "error",
    available,
    summary: available
      ? `Terminal sessions default to ${path.basename(executablePath ?? fallbackShell)}.`
      : "No interactive shell was resolved for terminal sessions.",
    detail: available && executablePath
      ? `Terminal sessions launch from ${executablePath}.`
      : "Terminal sessions rely on the current process shell. Configure SHELL or the platform shell defaults before using Stave's terminal features.",
    version: null,
    executablePath,
    authState: "not-required",
  });
}

async function inspectGitStatus() {
  const executablePath = resolveSystemExecutablePath("git");
  if (!executablePath) {
    return makeToolEntry({
      id: "git",
      label: "Git CLI",
      state: "error",
      available: false,
      summary: "Git CLI is unavailable.",
      detail: "Stave could not resolve `git` from the login-shell PATH or bundled lookup locations.",
      version: null,
      executablePath: null,
      authState: "not-required",
    });
  }

  const result = await runCommandArgs({
    command: executablePath,
    commandArgs: ["--version"],
    env: buildRuntimeProcessEnv({ executablePath }),
  });
  const version = firstMeaningfulLine(result.stdout || result.stderr);
  const available = result.ok;

  return makeToolEntry({
    id: "git",
    label: "Git CLI",
    state: available ? "ready" : "error",
    available,
    summary: available
      ? (version ?? "Git CLI is ready.")
      : "Git CLI failed to respond.",
    detail: formatToolDetail({
      executablePath,
      version,
      authDetail: null,
      failureDetail: combineCommandDetail(result),
      available,
    }),
    version,
    executablePath,
    authState: "not-required",
  });
}

async function inspectGhStatus() {
  const executablePath = resolveSystemExecutablePath("gh");
  if (!executablePath) {
    return makeToolEntry({
      id: "gh",
      label: "GitHub CLI",
      state: "error",
      available: false,
      summary: "GitHub CLI is unavailable.",
      detail: "Stave cannot create PRs, refresh PR status, or inspect GitHub auth until `gh` is installed.",
      version: null,
      executablePath: null,
      authState: "unauthenticated",
      authDetail: "Install `gh` and run `gh auth login`.",
    });
  }

  const env = buildRuntimeProcessEnv({ executablePath });
  const [versionResult, authResult] = await Promise.all([
    runCommandArgs({
      command: executablePath,
      commandArgs: ["--version"],
      env,
    }),
    runCommandArgs({
      command: executablePath,
      commandArgs: ["auth", "status"],
      env,
    }),
  ]);

  const version = firstMeaningfulLine(versionResult.stdout || versionResult.stderr);
  const available = versionResult.ok;
  const { authState, authDetail } = parseGhAuthState(authResult);

  return makeToolEntry({
    id: "gh",
    label: "GitHub CLI",
    state: stateFromAvailability({ available, authState }),
    available,
    summary: formatToolSummary({
      label: "GitHub CLI",
      available,
      version,
      authState,
    }),
    detail: formatToolDetail({
      executablePath,
      version,
      authDetail,
      failureDetail: combineCommandDetail(versionResult),
      available,
    }),
    version,
    executablePath,
    authState,
    authDetail,
  });
}

async function inspectClaudeStatus(args: { claudeBinaryPath?: string } = {}) {
  const executablePath = resolveClaudeExecutablePath({
    explicitPath: args.claudeBinaryPath,
  }) || null;
  if (!executablePath) {
    return makeToolEntry({
      id: "claude",
      label: "Claude CLI",
      state: "error",
      available: false,
      summary: "Claude CLI is unavailable.",
      detail: "Stave cannot start Claude turns until the local `claude` executable is resolved from your login shell PATH or configured locations.",
      version: null,
      executablePath: null,
      authState: "unauthenticated",
      authDetail: "Install Claude Code and run `claude auth login`.",
    });
  }

  const env = buildClaudeEnv({ executablePath });
  const configDir = env.CLAUDE_CONFIG_DIR?.trim()
    ? env.CLAUDE_CONFIG_DIR.trim()
    : null;
  const [versionResult, authResult] = await Promise.all([
    runCommandArgs({
      command: executablePath,
      commandArgs: ["--version"],
      env,
    }),
    runCommandArgs({
      command: executablePath,
      commandArgs: ["auth", "status"],
      env,
    }),
  ]);

  const version = firstMeaningfulLine(versionResult.stdout || versionResult.stderr);
  const available = versionResult.ok;
  const { authState, authDetail } = parseClaudeAuthState(authResult);

  return makeToolEntry({
    id: "claude",
    label: "Claude CLI",
    state: stateFromAvailability({ available, authState }),
    available,
    summary: formatToolSummary({
      label: "Claude CLI",
      available,
      version,
      authState,
    }),
    detail: formatToolDetail({
      executablePath,
      version,
      authDetail,
      extraLines: [
        configDir
          ? `Config dir: ${configDir}`
          : "Config dir: (using Claude CLI default lookup)",
      ],
      failureDetail: combineCommandDetail(versionResult),
      available,
    }),
    version,
    executablePath,
    authState,
    authDetail,
  });
}

async function inspectCodexStatus(args: { codexBinaryPath?: string }) {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.codexBinaryPath,
  }) || null;
  if (!executablePath) {
    return makeToolEntry({
      id: "codex",
      label: "Codex CLI",
      state: "error",
      available: false,
      summary: "Codex CLI is unavailable.",
      detail: "Stave cannot start Codex turns until the local `codex` executable is resolved from your login shell PATH or configured override.",
      version: null,
      executablePath: null,
      authState: "unauthenticated",
      authDetail: "Install Codex CLI and run `codex login`.",
    });
  }

  const env = buildCodexCliEnv({ executablePath });
  const [versionResult, authResult] = await Promise.all([
    runCommandArgs({
      command: executablePath,
      commandArgs: ["--version"],
      env,
    }),
    runCommandArgs({
      command: executablePath,
      commandArgs: ["login", "status"],
      env,
    }),
  ]);

  const version = firstMeaningfulLine(versionResult.stdout || versionResult.stderr);
  const available = versionResult.ok;
  const { authState, authDetail } = parseCodexAuthState(authResult);

  return makeToolEntry({
    id: "codex",
    label: "Codex CLI",
    state: stateFromAvailability({ available, authState }),
    available,
    summary: formatToolSummary({
      label: "Codex CLI",
      available,
      version,
      authState,
    }),
    detail: formatToolDetail({
      executablePath,
      version,
      authDetail,
      failureDetail: combineCommandDetail(versionResult),
      available,
    }),
    version,
    executablePath,
    authState,
    authDetail,
  });
}

export async function getCodexMcpStatus(args: {
  codexBinaryPath?: string;
}): Promise<CodexMcpStatusResponse> {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.codexBinaryPath,
  }) || null;

  if (!executablePath) {
    return {
      ok: false,
      detail: "Codex CLI is unavailable. Configure a Codex binary path or install `codex` first.",
      servers: [],
    };
  }

  const env = buildCodexCliEnv({ executablePath });
  const result = await runCommandArgs({
    command: executablePath,
    commandArgs: ["mcp", "list", "--json"],
    env,
  });

  if (!result.ok) {
    return {
      ok: false,
      detail: combineCommandDetail(result) || "Codex MCP status command failed.",
      servers: [],
    };
  }

  const servers = parseCodexMcpServerList({
    stdout: result.stdout,
    stderr: result.stderr,
  });

  if (!servers) {
    return {
      ok: false,
      detail: "Codex MCP status returned unreadable JSON.",
      servers: [],
    };
  }

  return {
    ok: true,
    detail: servers.length > 0
      ? `Loaded ${servers.length} Codex MCP server configuration${servers.length === 1 ? "" : "s"}.`
      : "No Codex MCP servers are configured.",
    servers,
  };
}

export async function inspectWorkspaceSyncStatus(args: {
  cwd?: string;
}): Promise<WorkspaceSyncStatus> {
  const cwd = resolveCommandCwd({ cwd: args.cwd });
  const rootResult = await runCommand({
    command: "git rev-parse --show-toplevel",
    cwd,
  });

  if (!rootResult.ok) {
    return {
      cwd,
      rootPath: null,
      branch: null,
      trackingBranch: null,
      originUrl: null,
      ahead: null,
      behind: null,
      dirty: false,
      dirtyFileCount: 0,
      state: "not-git",
      summary: "Current workspace is not a git repository.",
      detail: combineCommandDetail(rootResult) || "Open a git-backed workspace to inspect sync status against the default branch.",
      hasOriginRemote: false,
      hasOriginMain: false,
      baseBranch: null,
      canFastForwardOriginMain: false,
      recommendedCommand: null,
    };
  }

  const rootPath = firstMeaningfulLine(rootResult.stdout) ?? cwd;
  const [
    branchResult,
    trackingResult,
    statusResult,
    originResult,
    aheadBehindMainResult,
    aheadBehindMasterResult,
  ] = await Promise.all([
    runCommand({ command: "git rev-parse --abbrev-ref HEAD", cwd }),
    runCommand({
      command: "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
      cwd,
    }),
    runCommand({ command: "git status --porcelain", cwd }),
    runCommand({ command: "git remote get-url origin", cwd }),
    runCommand({
      command: "git rev-list --left-right --count HEAD...origin/main",
      cwd,
    }),
    runCommand({
      command: "git rev-list --left-right --count HEAD...origin/master",
      cwd,
    }),
  ]);

  // Prefer origin/main; fall back to origin/master if main is not available.
  const aheadBehindResult = aheadBehindMainResult.ok
    ? aheadBehindMainResult
    : aheadBehindMasterResult;
  const baseBranch: string | null = aheadBehindMainResult.ok
    ? "origin/main"
    : aheadBehindMasterResult.ok
      ? "origin/master"
      : null;

  const branch = firstMeaningfulLine(branchResult.stdout);
  const trackingBranch = trackingResult.ok
    ? firstMeaningfulLine(trackingResult.stdout)
    : null;
  const dirtyItems = statusResult.ok
    ? parseStatusLines({ stdout: statusResult.stdout })
    : [];
  const dirty = dirtyItems.length > 0;
  const originUrl = originResult.ok
    ? firstMeaningfulLine(originResult.stdout)
    : null;
  const hasOriginRemote = Boolean(originUrl);
  const hasOriginMain = hasOriginRemote && aheadBehindResult.ok;
  const counts = hasOriginMain
    ? parseAheadBehindCounts({ stdout: aheadBehindResult.stdout })
    : { ahead: null, behind: null };

  const ahead = counts.ahead;
  const behind = counts.behind;
  const canFastForwardOriginMain = Boolean(
    hasOriginMain
      && !dirty
      && (ahead ?? 0) === 0
      && (behind ?? 0) > 0,
  );

  let state: WorkspaceSyncStatus["state"] = "unknown";
  let summary = "Workspace sync state could not be determined.";
  let detail = "";
  let recommendedCommand: string | null = null;

  if (!hasOriginRemote) {
    state = "missing-origin";
    summary = "No `origin` remote is configured for this workspace.";
    detail = "Add an `origin` remote before Stave can compare or sync against the default branch.";
    recommendedCommand = "git remote -v";
  } else if (!hasOriginMain) {
    state = "missing-origin-main";
    summary = "`origin/main` and `origin/master` are not available for this workspace.";
    detail = combineCommandDetail(aheadBehindResult)
      || "Fetch the remote or verify the default branch before syncing.";
    recommendedCommand = "git fetch origin --prune";
  } else if (dirty) {
    state = "dirty";
    summary = `Working tree has ${dirtyItems.length} uncommitted file${dirtyItems.length === 1 ? "" : "s"}.`;
    detail = [
      behind && behind > 0
        ? `The branch is also ${behind} commit${behind === 1 ? "" : "s"} behind ${baseBranch}.`
        : "",
      ahead && ahead > 0
        ? `The branch is ${ahead} commit${ahead === 1 ? "" : "s"} ahead of ${baseBranch}.`
        : "",
      `Clean the working tree before updating from ${baseBranch}.`,
    ]
      .filter(Boolean)
      .join(" ");
    recommendedCommand = "git status --short";
  } else if ((ahead ?? 0) > 0 && (behind ?? 0) > 0) {
    state = "diverged";
    summary = `Current branch diverged from ${baseBranch} (${ahead} ahead / ${behind} behind).`;
    detail = `A manual rebase or merge is required before Stave can consider this workspace aligned with ${baseBranch}.`;
    recommendedCommand = `git fetch origin --prune && git rebase ${baseBranch}`;
  } else if ((behind ?? 0) > 0) {
    state = "behind";
    summary = `Current branch is ${behind} commit${behind === 1 ? "" : "s"} behind ${baseBranch}.`;
    detail = "A fast-forward update is available.";
    recommendedCommand = `git fetch origin --prune && git merge --ff-only ${baseBranch}`;
  } else if ((ahead ?? 0) > 0) {
    state = "ahead";
    summary = `Current branch is ${ahead} commit${ahead === 1 ? "" : "s"} ahead of ${baseBranch}.`;
    detail = `Your workspace includes local commits. Rebase manually if you want to replay them on top of the latest ${baseBranch}.`;
    recommendedCommand = `git fetch origin --prune && git rebase ${baseBranch}`;
  } else {
    state = "synced";
    summary = `Current branch is up to date with ${baseBranch}.`;
    detail = "No update is required.";
    recommendedCommand = "git fetch origin --prune";
  }

  return {
    cwd,
    rootPath,
    branch,
    trackingBranch,
    originUrl,
    ahead,
    behind,
    dirty,
    dirtyFileCount: dirtyItems.length,
    state,
    summary,
    detail,
    hasOriginRemote,
    hasOriginMain,
    baseBranch,
    canFastForwardOriginMain,
    recommendedCommand,
  };
}

export async function getToolingStatusSnapshot(
  args: ToolingStatusRequest = {},
): Promise<ToolingStatusSnapshot> {
  const workspace = await inspectWorkspaceSyncStatus({ cwd: args.cwd });
  const tools = await Promise.all([
    inspectShellStatus(),
    inspectGitStatus(),
    inspectGhStatus(),
    inspectClaudeStatus({ claudeBinaryPath: args.claudeBinaryPath }),
    inspectCodexStatus({ codexBinaryPath: args.codexBinaryPath }),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    workspace,
    tools,
  };
}

export async function syncWorkspaceWithOriginMain(
  args: SyncOriginMainRequest = {},
): Promise<SyncOriginMainResult> {
  const workspace = await inspectWorkspaceSyncStatus({ cwd: args.cwd });
  if (!workspace.hasOriginRemote) {
    return {
      ok: false,
      summary: "Cannot sync without an `origin` remote.",
      detail: workspace.detail,
      workspace,
    };
  }
  if (!workspace.hasOriginMain) {
    return {
      ok: false,
      summary: "Cannot sync because neither `origin/main` nor `origin/master` is available.",
      detail: workspace.detail,
      workspace,
    };
  }
  if (workspace.dirty) {
    return {
      ok: false,
      summary: "Cannot sync while the working tree has uncommitted changes.",
      detail: workspace.detail,
      workspace,
    };
  }
  if ((workspace.ahead ?? 0) > 0) {
    return {
      ok: false,
      summary: "Fast-forward sync is blocked by local commits.",
      detail: workspace.detail,
      workspace,
    };
  }

  const effectiveBaseBranch = workspace.baseBranch ?? "origin/main";

  if ((workspace.behind ?? 0) === 0) {
    return {
      ok: true,
      summary: `Workspace is already up to date with ${effectiveBaseBranch}.`,
      detail: workspace.detail,
      workspace,
    };
  }

  const fetchResult = await runCommand({
    command: "git fetch origin --prune",
    cwd: workspace.cwd ?? args.cwd,
  });
  if (!fetchResult.ok) {
    return {
      ok: false,
      summary: "Failed to fetch `origin` before syncing.",
      detail: combineCommandDetail(fetchResult) || "git fetch origin --prune failed.",
      workspace: await inspectWorkspaceSyncStatus({ cwd: workspace.cwd ?? args.cwd }),
    };
  }

  const mergeResult = await runCommand({
    command: `git merge --ff-only ${effectiveBaseBranch}`,
    cwd: workspace.cwd ?? args.cwd,
  });
  const nextWorkspace = await inspectWorkspaceSyncStatus({
    cwd: workspace.cwd ?? args.cwd,
  });

  if (!mergeResult.ok) {
    return {
      ok: false,
      summary: `Fast-forward sync against ${effectiveBaseBranch} failed.`,
      detail: [
        combineCommandDetail(fetchResult),
        combineCommandDetail(mergeResult),
      ]
        .filter(Boolean)
        .join("\n\n"),
      workspace: nextWorkspace,
    };
  }

  return {
    ok: true,
    summary: `Workspace synced with ${effectiveBaseBranch}.`,
    detail: [
      combineCommandDetail(fetchResult),
      combineCommandDetail(mergeResult),
    ]
      .filter(Boolean)
      .join("\n\n")
      || `Current branch fast-forwarded to ${effectiveBaseBranch}.`,
    workspace: nextWorkspace,
  };
}
