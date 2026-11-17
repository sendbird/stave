import { spawn } from "node:child_process";
import { createCommandOutputCollector } from "../main/utils/command";
import { buildExecutableLookupEnv } from "../providers/executable-path";
import { buildRepositoryShellEnv } from "../shared/repository-node-env";

export class WorkspacePreparationError extends Error {}
export const WORKSPACE_PREPARATION_TIMEOUT_MS = 5 * 60_000;

/** A post-create shell owns its process group, including watchers and prompted descendants. */
export function runWorkspacePreparation(args: { command: string; cwd: string; signal?: AbortSignal; timeoutMs?: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (args.signal?.aborted) { reject(args.signal.reason); return; }
    const child = spawn(args.command, { shell: true, cwd: args.cwd, detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe"], env: buildRepositoryShellEnv({ cwd: args.cwd,
        baseEnv: buildExecutableLookupEnv({}) }) });
    const stderr = createCommandOutputCollector(2_000);
    let settled = false;
    const cleanup = () => { clearTimeout(timeout); args.signal?.removeEventListener("abort", abort); };
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else if (child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => child.kill(signal));
        else child.kill(signal);
      } catch { /* The group already exited. */ }
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      kill("SIGTERM");
      // Do not cancel escalation when the shell exits: its descendants can still hold the group.
      if (process.platform !== "win32") {
        const force = setTimeout(() => kill("SIGKILL"), 1_000);
        force.unref?.();
      }
      reject(new WorkspacePreparationError(`${message} Check the workspace post-create command, then resume this work to retry. ${stderr.finish()}`.slice(0, 2_000)));
    };
    const abort = () => fail("Workspace preparation was interrupted.");
    const timeout = setTimeout(() => fail("Workspace preparation timed out."), args.timeoutMs ?? WORKSPACE_PREPARATION_TIMEOUT_MS);
    timeout.unref?.();
    args.signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
    child.on("error", (error) => fail(`Workspace preparation could not start: ${error.message}.`));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) { fail(`Workspace preparation failed (exit ${code ?? "unknown"}).`); return; }
      settled = true; cleanup(); resolve();
    });
  });
}
