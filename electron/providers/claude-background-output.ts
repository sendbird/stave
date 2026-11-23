import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BACKGROUND_LOG_TAIL_BYTES, type BackgroundLogTail } from "../../src/lib/providers/background-tasks";
import { stripAnsiControlSequences } from "../../src/lib/workspace-scripts/ansi";

export async function readClaudeBackgroundTail(
  filePath: string, sessionId: string, taskId: string,
): Promise<BackgroundLogTail | undefined> {
  // Task output is a native provider artifact. Never follow a workspace log
  // named in the command or a path supplied by the renderer.
  if (!path.isAbsolute(filePath) || !/^[\w-]+$/.test(sessionId) || !/^[\w-]+$/.test(taskId)) return;
  try {
    const rootCandidates = [tmpdir(), "/tmp"];
    const resolved = await realpath(filePath);
    const roots = await Promise.allSettled(rootCandidates.map((root) => realpath(root)));
    const belongsToSession = roots.some((root) => {
      if (root.status !== "fulfilled") return false;
      const parts = path.relative(root.value, resolved).split(path.sep);
      return parts.length === 5
        && /^claude-[\w-]+$/.test(parts[0] ?? "")
        && parts[2] === sessionId && parts[3] === "tasks" && parts[4] === `${taskId}.output`;
    });
    if (!belongsToSession || resolved !== path.join(await realpath(path.dirname(filePath)), path.basename(filePath))) return;
    const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) return;
      const length = Math.min(stat.size, BACKGROUND_LOG_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, stat.size - length);
      return {
        text: stripAnsiControlSequences(buffer.subarray(0, bytesRead).toString("utf8")),
        truncated: length < stat.size,
      };
    } finally {
      await handle.close();
    }
  } catch {
    // An output file may not exist yet, or the provider may already have cleared it.
    return undefined;
  }
}
