// ---------------------------------------------------------------------------
// Workspace Scripts – Execution Engine (Electron main process)
// ---------------------------------------------------------------------------

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as pty from "node-pty";
import { SCRIPT_ENV_VARS } from "../../../src/lib/workspace-scripts/constants";
import {
  getScriptEntry,
  getScriptHooksForTrigger,
} from "../../../src/lib/workspace-scripts/config";
import type {
  ScriptHookContext,
  ScriptKind,
  ScriptTrigger,
  ResolvedWorkspaceScript,
  ResolvedWorkspaceScriptsConfig,
  WorkspaceScriptEvent,
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptHookRunSummary,
  WorkspaceScriptRunSource,
  WorkspaceScriptStatusEntry,
} from "../../../src/lib/workspace-scripts/types";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import {
  deleteWorkspaceScriptProcess,
  getWorkspaceScriptStatusesForWorkspace,
  getScriptProcessKey,
  recordWorkspaceScriptEvent,
  getWorkspaceScriptProcess,
  listWorkspaceScriptProcessesForWorkspace,
  listWorkspaceScriptProcessKeys,
  setWorkspaceScriptProcess,
  type WorkspaceScriptProcess,
} from "./state";
import { createScriptOutputBuffer } from "./output-buffer";
import {
  buildOrbitDisplayCommand,
  buildOrbitEnv,
  buildOrbitGetArgs,
  buildOrbitShellWrapperRunArgs,
  buildPortlessLaunchSpec,
  buildOrbitRunArgs,
  extractOrbitOutput,
  resolvePortlessCommand,
  tokenizeOrbitCommand,
} from "./orbit";

const SIGTERM_GRACE_MS = 5_000;

let workspaceScriptEventListener:
  | ((envelope: WorkspaceScriptEventEnvelope) => void)
  | null = null;

export function setWorkspaceScriptEventListener(
  listener: ((envelope: WorkspaceScriptEventEnvelope) => void) | null,
) {
  workspaceScriptEventListener = listener;
}

function emitScriptEvent(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  sessionId?: string;
  source: WorkspaceScriptRunSource;
  event: WorkspaceScriptEvent;
}) {
  recordWorkspaceScriptEvent(args);
  workspaceScriptEventListener?.(args);
}

function buildScriptEnv(args: {
  projectPath: string;
  workspaceName: string;
  workspacePath: string;
  branch: string;
  scriptEntry: ResolvedWorkspaceScript;
  source: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}): NodeJS.ProcessEnv {
  return {
    ...buildExecutableLookupEnv(),
    [SCRIPT_ENV_VARS.ROOT_PATH]: args.projectPath,
    [SCRIPT_ENV_VARS.WORKSPACE_NAME]: args.workspaceName,
    [SCRIPT_ENV_VARS.WORKSPACE_PATH]: args.workspacePath,
    [SCRIPT_ENV_VARS.BRANCH]: args.branch,
    ...(args.hookContext?.taskId
      ? { [SCRIPT_ENV_VARS.TASK_ID]: args.hookContext.taskId }
      : {}),
    ...(args.hookContext?.taskTitle
      ? { [SCRIPT_ENV_VARS.TASK_TITLE]: args.hookContext.taskTitle }
      : {}),
    ...(args.hookContext?.turnId
      ? { [SCRIPT_ENV_VARS.TURN_ID]: args.hookContext.turnId }
      : {}),
    [SCRIPT_ENV_VARS.TARGET_ID]: args.scriptEntry.targetId,
    ...(args.source.kind === "hook"
      ? { [SCRIPT_ENV_VARS.TRIGGER]: args.source.trigger }
      : {}),
    ...args.scriptEntry.target.env,
  };
}

function resolveScriptCwd(args: {
  projectPath: string;
  workspacePath: string;
  scriptEntry: ResolvedWorkspaceScript;
}) {
  return args.scriptEntry.target.cwd === "project"
    ? args.projectPath
    : args.workspacePath;
}

function createProcessKey(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}) {
  return getScriptProcessKey(args);
}

function createProcessEntry(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  source: WorkspaceScriptRunSource;
  process: WorkspaceScriptProcess["process"];
  sessionId?: string;
}) {
  const entry: WorkspaceScriptProcess = {
    workspaceId: args.workspaceId,
    scriptId: args.scriptId,
    scriptKind: args.scriptKind,
    runId: args.runId,
    source: args.source,
    process: args.process,
    aborted: false,
    sessionId: args.sessionId,
    log: "",
  };
  setWorkspaceScriptProcess(
    createProcessKey({
      workspaceId: args.workspaceId,
      scriptId: args.scriptId,
      scriptKind: args.scriptKind,
    }),
    entry,
  );
  return entry;
}

function killProcess(proc: ChildProcess | pty.IPty): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    try {
      proc.kill("SIGTERM");
    } catch {
      done();
      return;
    }

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // noop
      }
      done();
    }, SIGTERM_GRACE_MS);

    if ("on" in proc && typeof proc.on === "function") {
      (proc as ChildProcess).once("close", () => {
        clearTimeout(timer);
        done();
      });
    } else if ("onExit" in proc && typeof proc.onExit === "function") {
      let exitSubscription: pty.IDisposable | null = null;
      exitSubscription = (proc as pty.IPty).onExit(() => {
        exitSubscription?.dispose();
        exitSubscription = null;
        clearTimeout(timer);
        done();
      });
    }
  });
}

export async function stopScriptEntry(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}): Promise<void> {
  const key = createProcessKey(args);
  const entry = getWorkspaceScriptProcess(key);
  if (!entry) {
    return;
  }
  entry.aborted = true;
  entry.cleanup?.();
  entry.cleanup = undefined;
  if (entry.process) {
    await killProcess(entry.process);
  }
  emitScriptEvent({
    workspaceId: entry.workspaceId,
    scriptId: entry.scriptId,
    scriptKind: entry.scriptKind,
    runId: entry.runId,
    sessionId: entry.sessionId,
    source: entry.source,
    event: { type: "stopped" },
  });
  deleteWorkspaceScriptProcess(key);
}

async function runFiniteScript(args: {
  workspaceId: string;
  scriptEntry: ResolvedWorkspaceScript;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}) {
  const runId = randomUUID();
  const key = createProcessKey({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
  });

  await stopScriptEntry({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
  });

  const env = buildScriptEnv(args);
  const cwd = resolveScriptCwd(args);
  const entry = createProcessEntry({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
    runId,
    source: args.source,
    process: null,
  });
  const outputBuffer = createScriptOutputBuffer((data) => {
    emitScriptEvent({
      workspaceId: args.workspaceId,
      scriptId: args.scriptEntry.id,
      scriptKind: args.scriptEntry.kind,
      runId,
      source: args.source,
      event: { type: "output", data },
    });
  });

  let lastExitCode = 0;

  for (let index = 0; index < args.scriptEntry.commands.length; index += 1) {
    if (entry.aborted) {
      deleteWorkspaceScriptProcess(key);
      return { ok: false as const, runId, exitCode: -1, error: "Aborted" };
    }

    const command = args.scriptEntry.commands[index];
    emitScriptEvent({
      workspaceId: args.workspaceId,
      scriptId: args.scriptEntry.id,
      scriptKind: args.scriptEntry.kind,
      runId,
      source: args.source,
      event: {
        type: "started",
        commandIndex: index,
        command,
        totalCommands: args.scriptEntry.commands.length,
      },
    });

    try {
      lastExitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(command, {
          shell: args.scriptEntry.target.shell ?? true,
          cwd,
          env,
        });
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        const clearScriptTimeout = () => {
          if (timeoutHandle != null) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
        };

        entry.process = child;

        child.stdout?.on("data", (chunk: Buffer) => {
          outputBuffer.push(chunk.toString());
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          outputBuffer.push(chunk.toString());
        });

        child.once("error", (error) => {
          clearScriptTimeout();
          reject(error);
        });
        child.once("close", (code) => {
          clearScriptTimeout();
          resolve(code ?? -1);
        });

        if (args.scriptEntry.timeoutMs) {
          timeoutHandle = setTimeout(() => {
            timeoutHandle = null;
            if (!entry.aborted) {
              entry.aborted = true;
              try {
                child.kill("SIGKILL");
              } catch {
                // noop
              }
              reject(
                new Error(
                  `Script timed out after ${args.scriptEntry.timeoutMs}ms`,
                ),
              );
            }
          }, args.scriptEntry.timeoutMs);
        }
      });
    } catch (error) {
      outputBuffer.flush();
      const message = error instanceof Error ? error.message : String(error);
      emitScriptEvent({
        workspaceId: args.workspaceId,
        scriptId: args.scriptEntry.id,
        scriptKind: args.scriptEntry.kind,
        runId,
        source: args.source,
        event: { type: "error", error: message },
      });
      deleteWorkspaceScriptProcess(key);
      return { ok: false as const, runId, exitCode: -1, error: message };
    }

    outputBuffer.flush();
    entry.process = null;
    emitScriptEvent({
      workspaceId: args.workspaceId,
      scriptId: args.scriptEntry.id,
      scriptKind: args.scriptEntry.kind,
      runId,
      source: args.source,
      event: {
        type: "command-completed",
        commandIndex: index,
        exitCode: lastExitCode,
      },
    });

    if (lastExitCode !== 0) {
      emitScriptEvent({
        workspaceId: args.workspaceId,
        scriptId: args.scriptEntry.id,
        scriptKind: args.scriptEntry.kind,
        runId,
        source: args.source,
        event: { type: "completed", exitCode: lastExitCode },
      });
      deleteWorkspaceScriptProcess(key);
      return { ok: false as const, runId, exitCode: lastExitCode };
    }
  }

  emitScriptEvent({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
    runId,
    source: args.source,
    event: { type: "completed", exitCode: 0 },
  });
  deleteWorkspaceScriptProcess(key);
  return { ok: true as const, runId, exitCode: 0 };
}

async function runServiceScript(args: {
  workspaceId: string;
  scriptEntry: ResolvedWorkspaceScript;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}) {
  const key = createProcessKey({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
  });
  const existing = getWorkspaceScriptProcess(key);
  if (
    existing &&
    !existing.aborted &&
    args.scriptEntry.restartOnRun === false
  ) {
    return {
      ok: true as const,
      runId: existing.runId,
      sessionId: existing.sessionId,
      alreadyRunning: true,
    };
  }

  await stopScriptEntry({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
  });

  const runId = randomUUID();
  const cwd = resolveScriptCwd(args);
  const prefixCommands = args.scriptEntry.commands.slice(0, -1);
  const lastCommand =
    args.scriptEntry.commands[args.scriptEntry.commands.length - 1];

  if (!lastCommand) {
    return { ok: true as const, runId };
  }

  if (prefixCommands.length > 0) {
    const prefixResult = await runFiniteScript({
      ...args,
      scriptEntry: { ...args.scriptEntry, commands: prefixCommands },
    });
    if (!prefixResult.ok) {
      return prefixResult;
    }
  }

  if (args.scriptEntry.orbit && args.scriptEntry.target.cwd !== "workspace") {
    return {
      ok: false as const,
      runId,
      error: "Orbit services must target the workspace path.",
      exitCode: -1,
    };
  }

  const orbitCommand = args.scriptEntry.orbit ? resolvePortlessCommand() : null;
  if (args.scriptEntry.orbit && !orbitCommand) {
    return {
      ok: false as const,
      runId,
      error: "Orbit could not find the portless executable.",
      exitCode: -1,
    };
  }

  const orbitEnv = args.scriptEntry.orbit
    ? buildOrbitEnv({ orbit: args.scriptEntry.orbit })
    : null;
  const env = orbitEnv
    ? { ...buildScriptEnv(args), ...orbitEnv }
    : buildScriptEnv(args);
  const orbitCommandArgs = args.scriptEntry.orbit
    ? tokenizeOrbitCommand(lastCommand)
    : null;
  const orbitRunArgs =
    args.scriptEntry.orbit && orbitCommand && orbitCommandArgs
      ? buildOrbitRunArgs({
          commandArgs: orbitCommandArgs,
          orbit: args.scriptEntry.orbit,
          defaultName: path.basename(args.projectPath),
        })
      : args.scriptEntry.orbit && orbitCommand
        ? buildOrbitShellWrapperRunArgs({
            command: lastCommand,
            orbit: args.scriptEntry.orbit,
            defaultName: path.basename(args.projectPath),
          })
        : null;
  const orbitLaunchSpec =
    args.scriptEntry.orbit && orbitCommand && orbitRunArgs
      ? buildPortlessLaunchSpec({
          portlessCommand: orbitCommand,
          orbitArgs: orbitRunArgs,
        })
      : null;
  const orbitUsesShellWrapper = Boolean(
    args.scriptEntry.orbit && orbitCommand && !orbitCommandArgs,
  );
  const commandToRun = orbitLaunchSpec
    ? buildOrbitDisplayCommand({
        portlessCommand: orbitCommand,
        orbitArgs: orbitRunArgs,
      })
    : lastCommand;

  const shellExe =
    args.scriptEntry.target.shell || process.env.SHELL || "/bin/bash";
  const orbitProcessEnv = orbitLaunchSpec
    ? { ...env, ...orbitLaunchSpec.env }
    : env;
  const ptyProcess = orbitLaunchSpec
    ? pty.spawn(orbitLaunchSpec.command, orbitLaunchSpec.args, {
        name: "xterm-color",
        cols: 120,
        rows: 30,
        cwd,
        env: orbitProcessEnv as Record<string, string>,
      })
    : pty.spawn(shellExe, ["-c", commandToRun], {
        name: "xterm-color",
        cols: 120,
        rows: 30,
        cwd,
        env: env as Record<string, string>,
      });
  const sessionId = randomUUID();

  const entry = createProcessEntry({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
    runId,
    source: args.source,
    process: ptyProcess,
    sessionId,
  });
  const outputBuffer = createScriptOutputBuffer((data) => {
    emitScriptEvent({
      workspaceId: args.workspaceId,
      scriptId: args.scriptEntry.id,
      scriptKind: args.scriptEntry.kind,
      runId,
      sessionId,
      source: args.source,
      event: { type: "output", data },
    });
  });

  emitScriptEvent({
    workspaceId: args.workspaceId,
    scriptId: args.scriptEntry.id,
    scriptKind: args.scriptEntry.kind,
    runId,
    sessionId,
    source: args.source,
    event: {
      type: "started",
      commandIndex: args.scriptEntry.commands.length - 1,
      command: commandToRun,
      totalCommands: args.scriptEntry.commands.length,
    },
  });

  if (args.scriptEntry.orbit && orbitCommand && orbitRunArgs) {
    const orbitGetLaunchSpec = buildPortlessLaunchSpec({
      portlessCommand: orbitCommand,
      orbitArgs: buildOrbitGetArgs({
        orbit: args.scriptEntry.orbit,
        defaultName: path.basename(args.projectPath),
      }),
    });
    const orbitUrlResult = spawnSync(
      orbitGetLaunchSpec.command,
      orbitGetLaunchSpec.args,
      {
        cwd,
        env: {
          ...env,
          ...orbitGetLaunchSpec.env,
        },
        encoding: "utf8",
      },
    );
    const orbitUrl =
      orbitUrlResult.status === 0 ? orbitUrlResult.stdout.trim() : "";
    if (orbitUrl) {
      emitScriptEvent({
        workspaceId: args.workspaceId,
        scriptId: args.scriptEntry.id,
        scriptKind: args.scriptEntry.kind,
        runId,
        sessionId,
        source: args.source,
        event: { type: "orbit-url", url: orbitUrl },
      });
    }
  }

  let orbitBuffer = "";
  let dataSubscription: pty.IDisposable | null = null;
  let exitSubscription: pty.IDisposable | null = null;
  const cleanupSubscriptions = () => {
    dataSubscription?.dispose();
    exitSubscription?.dispose();
    dataSubscription = null;
    exitSubscription = null;
    entry.cleanup = undefined;
  };
  entry.cleanup = cleanupSubscriptions;

  dataSubscription = ptyProcess.onData((data) => {
    if (args.scriptEntry.orbit && orbitUsesShellWrapper) {
      const parsed = extractOrbitOutput({
        buffer: orbitBuffer,
        chunk: data,
      });
      orbitBuffer = parsed.buffer;

      for (const orbitUrl of parsed.orbitUrls) {
        emitScriptEvent({
          workspaceId: args.workspaceId,
          scriptId: args.scriptEntry.id,
          scriptKind: args.scriptEntry.kind,
          runId,
          sessionId,
          source: args.source,
          event: { type: "orbit-url", url: orbitUrl },
        });
      }

      if (!parsed.output) {
        return;
      }

      outputBuffer.push(parsed.output);
      return;
    }

    outputBuffer.push(data);
  });

  exitSubscription = ptyProcess.onExit(({ exitCode }) => {
    cleanupSubscriptions();
    if (orbitUsesShellWrapper && orbitBuffer) {
      outputBuffer.push(orbitBuffer);
    }
    outputBuffer.flush();
    if (entry.aborted) {
      deleteWorkspaceScriptProcess(key);
      return;
    }
    emitScriptEvent({
      workspaceId: args.workspaceId,
      scriptId: args.scriptEntry.id,
      scriptKind: args.scriptEntry.kind,
      runId,
      sessionId,
      source: args.source,
      event: { type: "completed", exitCode: exitCode ?? -1 },
    });
    deleteWorkspaceScriptProcess(key);
  });

  return { ok: true as const, runId, sessionId };
}

export async function runScriptEntry(args: {
  workspaceId: string;
  scriptEntry: ResolvedWorkspaceScript;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source?: WorkspaceScriptRunSource;
  hookContext?: ScriptHookContext;
}) {
  const source = args.source ?? { kind: "manual" as const };
  if (args.scriptEntry.kind === "service") {
    return runServiceScript({ ...args, source });
  }
  return runFiniteScript({ ...args, source });
}

export async function runScriptHook(args: {
  workspaceId: string;
  trigger: ScriptTrigger;
  config: ResolvedWorkspaceScriptsConfig;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  hookContext?: ScriptHookContext;
}): Promise<WorkspaceScriptHookRunSummary> {
  const refs = getScriptHooksForTrigger(args.config, args.trigger);
  const summary: WorkspaceScriptHookRunSummary = {
    trigger: args.trigger,
    totalEntries: refs.length,
    executedEntries: 0,
    failures: [],
  };

  for (const ref of refs) {
    const scriptEntry = getScriptEntry(args.config, {
      scriptId: ref.scriptId,
      kind: ref.scriptKind,
    });
    if (!scriptEntry) {
      summary.failures.push({
        scriptId: ref.scriptId,
        message: "Script entry not found.",
      });
      if (ref.blocking) {
        break;
      }
      continue;
    }

    const result = await runScriptEntry({
      workspaceId: args.workspaceId,
      scriptEntry,
      projectPath: args.projectPath,
      workspacePath: args.workspacePath,
      workspaceName: args.workspaceName,
      branch: args.branch,
      source: { kind: "hook", trigger: args.trigger },
      hookContext: args.hookContext,
    });

    if (!result.ok) {
      summary.failures.push({
        scriptId: ref.scriptId,
        message:
          "error" in result && result.error
            ? result.error
            : `Exited with ${result.exitCode ?? -1}`,
      });
      if (ref.blocking) {
        break;
      }
      continue;
    }

    summary.executedEntries += 1;
  }

  return summary;
}

export function getScriptStatuses(args: {
  workspaceId: string;
}): WorkspaceScriptStatusEntry[] {
  return getWorkspaceScriptStatusesForWorkspace(args.workspaceId);
}

export async function stopAllWorkspaceScriptProcesses(args: {
  workspaceId: string;
}): Promise<void> {
  const entries = listWorkspaceScriptProcessesForWorkspace(args.workspaceId);
  await Promise.all(
    entries.map((entry) =>
      stopScriptEntry({
        workspaceId: entry.workspaceId,
        scriptId: entry.scriptId,
        scriptKind: entry.scriptKind,
      }),
    ),
  );
}

export async function cleanupAllScriptProcesses(): Promise<void> {
  const keys = listWorkspaceScriptProcessKeys();
  await Promise.all(
    keys.map(async (key) => {
      const entry = getWorkspaceScriptProcess(key);
      if (!entry) {
        return;
      }
      entry.aborted = true;
      entry.cleanup?.();
      entry.cleanup = undefined;
      if (entry.process) {
        await killProcess(entry.process);
      }
      deleteWorkspaceScriptProcess(key);
    }),
  );
}
