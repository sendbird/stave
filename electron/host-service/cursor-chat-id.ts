import { execFile } from "node:child_process";
import {
  buildCursorAgentEnv,
  resolveCursorAgentExecutablePath,
} from "../providers/cursor-cli-env";

/**
 * Unlike Codex and Kiro, Cursor keeps conversations server-side — the local
 * `~/.cursor/projects/<slug>` directories are empty, so there is nothing to
 * scan after spawn to learn which chat a PTY started. `agent create-chat` is
 * the only way to get an id, and it has to happen *before* the PTY starts so
 * the CLI can be launched with `--resume <chatId>`.
 *
 * It is a network call (~2s), so it is exposed as its own async IPC rather than
 * being folded into the synchronous `createCliSession` path. Callers treat a
 * failure as "start without an id": the tab then works normally but cannot be
 * resumed after an app restart.
 */
export interface CreateCursorChatIdResult {
  ok: boolean;
  chatId?: string;
  stderr?: string;
}

const CURSOR_CREATE_CHAT_TIMEOUT_MS = 20_000;
const CHAT_ID_PATTERN = /^[0-9a-fA-F-]{16,200}$/;

/**
 * `agent create-chat` prints the id on its own line, but can prepend update
 * notices, so only the last whitespace-separated token is considered.
 */
export function parseCursorChatId(args: { stdout: string }): string {
  const candidate = args.stdout.trim().split(/\s+/).at(-1) ?? "";
  return CHAT_ID_PATTERN.test(candidate) ? candidate : "";
}

export function createCursorChatId(args: {
  cwd: string;
  cursorBinaryPath?: string;
}): Promise<CreateCursorChatIdResult> {
  const executablePath = resolveCursorAgentExecutablePath({
    explicitPath: args.cursorBinaryPath,
  });
  if (!executablePath) {
    return Promise.resolve({
      ok: false,
      stderr:
        "Cursor agent executable not found. Check Cursor CLI installation or the configured binary path.",
    });
  }

  return new Promise((resolve) => {
    execFile(
      executablePath,
      ["create-chat"],
      {
        cwd: args.cwd,
        env: buildCursorAgentEnv({ executablePath }) as NodeJS.ProcessEnv,
        timeout: CURSOR_CREATE_CHAT_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            stderr: stderr?.trim() || error.message,
          });
          return;
        }
        const chatId = parseCursorChatId({ stdout });
        if (!chatId) {
          resolve({
            ok: false,
            stderr: "Cursor CLI did not return a chat id.",
          });
          return;
        }
        resolve({ ok: true, chatId });
      },
    );
  });
}
