import * as pty from "node-pty";
import type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
} from "../../../src/lib/providers/provider.types";
import {
  buildClaudeCliEnv,
  resolveClaudeCliExecutablePath,
} from "../cli-path-env";

const USAGE_SLASH_COMMAND = "/usage\r";
// Give the CLI a moment to clear its startup banner before sending the
// slash command — sending immediately can land inside that banner instead
// of the prompt.
const SEND_COMMAND_DELAY_MS = 800;
// Once output stops changing for this long, assume the /usage panel has
// finished rendering and stop waiting.
const OUTPUT_SETTLE_DELAY_MS = 1_500;
// Hard cap so a hung/unexpected CLI prompt can't block the status bar
// refresh indefinitely.
const CAPTURE_TIMEOUT_MS = 6_000;

const PERCENT_RE = /(\d{1,3})%\s*(remaining|left|used|consumed)/i;
const RESET_RE = /resets?\s+in\s+([0-9dhm\s]+)/i;
const SESSION_LABEL_RE = /current session/i;
const WEEKLY_LABEL_RE =
  /(current week|weekly limits|weekly usage|weekly rate limit|7-day)/i;

function parseRelativeDurationToSeconds(text: string): number | null {
  const days = text.match(/(\d+)\s*d/)?.[1];
  const hours = text.match(/(\d+)\s*h/)?.[1];
  const minutes = text.match(/(\d+)\s*m/)?.[1];
  if (!days && !hours && !minutes) {
    return null;
  }
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60
  );
}

function parseUsageWindow(block: string): ClaudeUsageWindow | null {
  const percentMatch = block.match(PERCENT_RE);
  if (!percentMatch) {
    return null;
  }
  const rawPercent = Number(percentMatch[1]);
  const qualifier = percentMatch[2].toLowerCase();
  const usedPercent =
    qualifier === "remaining" || qualifier === "left"
      ? 100 - rawPercent
      : rawPercent;

  const resetMatch = block.match(RESET_RE);
  const deltaSeconds = resetMatch
    ? parseRelativeDurationToSeconds(resetMatch[1])
    : null;
  const resetsAt =
    deltaSeconds !== null
      ? Math.floor(Date.now() / 1000) + deltaSeconds
      : null;

  return { usedPercent, resetsAt };
}

/**
 * Splits raw `/usage` panel text into blank-line-separated sections so
 * session/weekly windows are read from the right labeled block instead of
 * the first percentage found anywhere in the terminal output.
 */
function splitUsageSections(rawText: string): string[] {
  return rawText
    .split(/\r?\n\s*\r?\n/)
    .map((section) => section.trim())
    .filter(Boolean);
}

export function parseClaudeUsagePanelText(rawText: string): {
  session: ClaudeUsageWindow | null;
  weekly: ClaudeUsageWindow | null;
} {
  let session: ClaudeUsageWindow | null = null;
  let weekly: ClaudeUsageWindow | null = null;

  for (const section of splitUsageSections(rawText)) {
    if (!session && SESSION_LABEL_RE.test(section)) {
      session = parseUsageWindow(section);
      continue;
    }
    if (!weekly && WEEKLY_LABEL_RE.test(section)) {
      weekly = parseUsageWindow(section);
    }
  }

  return { session, weekly };
}

function toPtyEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function captureClaudeUsagePanelText(executablePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(executablePath, [], {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: process.cwd(),
        env: toPtyEnv(buildClaudeCliEnv({ executablePath })),
      });
    } catch (error) {
      reject(error);
      return;
    }

    let buffer = "";
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let sendCommandTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(hardTimer);
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      if (sendCommandTimer) {
        clearTimeout(sendCommandTimer);
      }
      try {
        ptyProcess.kill();
      } catch {
        // already exited
      }
      resolve(buffer);
    };

    const hardTimer = setTimeout(finish, CAPTURE_TIMEOUT_MS);

    ptyProcess.onData((chunk) => {
      buffer += chunk;
      if (settleTimer) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(finish, OUTPUT_SETTLE_DELAY_MS);
    });

    ptyProcess.onExit(() => finish());

    sendCommandTimer = setTimeout(() => {
      try {
        ptyProcess.write(USAGE_SLASH_COMMAND);
      } catch (error) {
        reject(error);
      }
    }, SEND_COMMAND_DELAY_MS);
  });
}

/**
 * Fallback path for when the Claude OAuth usage endpoint is unavailable:
 * spawn a hidden `claude` CLI PTY, send `/usage`, and parse the interactive
 * panel text it renders. This mirrors what the CLI itself shows, so it
 * degrades gracefully — if the CLI's wording changes or nothing readable
 * comes back, this returns `source: "unavailable"` instead of throwing.
 */
export async function fetchClaudeUsageViaCli(): Promise<ClaudeUsageSnapshot> {
  const executablePath = resolveClaudeCliExecutablePath();
  if (!executablePath) {
    return {
      source: "unavailable",
      session: null,
      weekly: null,
      error: "Claude CLI executable not found.",
    };
  }

  try {
    const rawText = await captureClaudeUsagePanelText(executablePath);
    const { session, weekly } = parseClaudeUsagePanelText(rawText);
    if (!session && !weekly) {
      return {
        source: "unavailable",
        session: null,
        weekly: null,
        error: "Could not parse the Claude CLI /usage panel output.",
      };
    }
    return { source: "cli", session, weekly, error: null };
  } catch (error) {
    return {
      source: "unavailable",
      session: null,
      weekly: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
