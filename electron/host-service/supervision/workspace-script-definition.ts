import { createHash } from "node:crypto";
import path from "node:path";
import type { ResolvedWorkspaceScript } from "../../../src/lib/workspace-scripts/types";

/** Hash execution configuration, not labels. Environment values stay host-only. */
export function workspaceScriptDefinitionHash(script: ResolvedWorkspaceScript, context: {
  repositoryPath: string; workspacePath: string; workspaceName: string; branch: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    ...context,
    commands: script.commands,
    cwd: path.resolve(script.target.cwd === "project" ? context.repositoryPath : context.workspacePath),
    shell: script.target.shell ?? (process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "/bin/sh"),
    env: Object.entries(script.target.env).sort(([left], [right]) => left.localeCompare(right)),
    targetId: script.targetId,
    timeoutMs: script.timeoutMs ?? null,
  })).digest("hex");
}
