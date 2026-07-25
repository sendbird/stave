/**
 * Resolve the current git HEAD commit for a working directory.
 *
 * Extracted verbatim from `codex-app-server-runtime.ts` to keep that file within
 * the max-lines ratchet; no behavior changed.
 */
import { execFileSync } from "node:child_process";

export function resolveGitHeadRef(args: { cwd?: string }) {
  if (!args.cwd) {
    return undefined;
  }
  try {
    const output = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: args.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const ref = output.trim();
    return ref || undefined;
  } catch {
    return undefined;
  }
}
