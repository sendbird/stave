import { spawn } from "node:child_process";
import { homedir } from "node:os";
import type {
  ClaudeUsageSnapshot,
  ClaudeUsageWindow,
} from "../../../src/lib/providers/provider.types";
import {
  buildClaudeCliEnv,
  resolveClaudeCliExecutablePath,
} from "../cli-path-env";

/**
 * `-p` (print mode) is what makes this fallback viable at all: it renders the
 * usage report as plain text and skips the workspace-trust dialog. The previous
 * implementation drove an interactive PTY and typed `/usage` into it, which
 * broke in three independent ways — the trust prompt swallowed the keystrokes
 * and its `\r` confirmed the dialog instead, the Ink panel positions text with
 * cursor-movement escapes so stripping ANSI glued words together, and partial
 * repaints left stale percentages in the buffer that won over the final ones.
 *
 * `--strict-mcp-config` keeps a background status-bar poll from booting every
 * MCP server the user has configured just to read two percentages.
 */
const USAGE_COMMAND_ARGS = ["--strict-mcp-config", "-p", "/usage"] as const;

// Generous: the CLI has to start up and hit its own usage endpoint. Still a
// hard cap so a wedged CLI can't pin the status-bar refresh open forever.
const CAPTURE_TIMEOUT_MS = 30_000;

const PERCENT_RE = /(\d{1,3})%\s*(remaining|left|used|consumed)\b/i;
const RELATIVE_RESET_RE = /resets?\s+in\s+([0-9dhm\s]+)/i;
const ABSOLUTE_RESET_RE = /resets?\s+(?!in\b)([^\r\n│┃|]+)/i;

/**
 * Window labels are matched at the start of a line and each window is read from
 * that same line, because the report puts label, percent, and reset together:
 *
 *   Current week (all models): 33% used · resets Aug 7 at 7:59am (Asia/Seoul)
 *
 * Anchoring this way also skips the report's trailing behavior breakdown
 * ("16% of your usage came from subagent-heavy sessions"), which a
 * percent-anywhere scan would happily misread as a limit.
 *
 * The Fable pattern is tested before the general weekly one: `Current week
 * (Fable)` satisfies both, and the model-scoped number must never land in the
 * account-wide weekly slot.
 */
const SESSION_LABEL_RE = /^\s*current session\b/i;
const FABLE_WEEKLY_LABEL_RE = /^\s*current week\s*\(\s*fable\b/i;
const WEEKLY_LABEL_RE =
  /^\s*(?:current week\b|weekly (?:limits|usage|rate limit)\b|7-day\b)/i;

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

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * `Date.parse` can't handle the report's compact "Dec 31, 12:00pm" wording, so
 * the clock time is destructured explicitly rather than handed to the engine.
 */
function parseClockTime(
  raw: string | undefined,
): { hours: number; minutes: number } | null {
  if (!raw) {
    return null;
  }
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!match) {
    return null;
  }
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) {
    hours += 12;
  } else if (meridiem === "am" && hours === 12) {
    hours = 0;
  }
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

/**
 * Reset labels arrive as "Aug 7 at 7:59am (Asia/Seoul)" or a time-only
 * "9:10am (Asia/Seoul)".
 *
 * The parenthesised zone is dropped rather than honoured: the CLI formats these
 * in the host's own zone, so reading the clock time as local reproduces the
 * same instant. It has to be removed explicitly though — left in place it
 * defeated the clock-time matcher, and a dated label then silently degraded to
 * midnight, reporting a reset up to a day early.
 *
 * The `at` separator is likewise elided so "Aug 7 at 7:59am" reduces to the
 * "<month> <day> <time>" shape the date matcher below expects.
 */
function normalizeResetLabel(label: string): string {
  return label
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]$/, "")
    .replace(/\bat\s+(?=\d)/i, "");
}

/**
 * Labels omit the year, so a month/day in the past is rolled to next year
 * rather than reported as a reset that already happened.
 */
export function parseAbsoluteResetToEpochSeconds(
  label: string,
  now: number = Date.now(),
): number | null {
  const trimmed = normalizeResetLabel(label);
  if (!trimmed) {
    return null;
  }

  const timeOnly = parseClockTime(trimmed);
  if (timeOnly) {
    const candidate = new Date(now);
    candidate.setHours(timeOnly.hours, timeOnly.minutes, 0, 0);
    if (candidate.getTime() <= now) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return Math.floor(candidate.getTime() / 1000);
  }

  const dated =
    /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:,?\s+(.+))?$/.exec(
      trimmed,
    );
  if (!dated) {
    return null;
  }
  const month = MONTH_NAMES.indexOf(dated[1].slice(0, 3).toLowerCase());
  const day = Number(dated[2]);
  if (month < 0 || day < 1 || day > 31) {
    return null;
  }
  const time = parseClockTime(dated[4]) ?? { hours: 0, minutes: 0 };
  const explicitYear = dated[3] ? Number(dated[3]) : null;
  const reference = new Date(now);
  const build = (year: number) =>
    new Date(year, month, day, time.hours, time.minutes, 0, 0).getTime();

  if (explicitYear !== null) {
    return Math.floor(build(explicitYear) / 1000);
  }
  const thisYear = build(reference.getFullYear());
  return Math.floor(
    (thisYear < now ? build(reference.getFullYear() + 1) : thisYear) / 1000,
  );
}

function parseResetsAt(line: string, now: number): number | null {
  const relativeMatch = line.match(RELATIVE_RESET_RE);
  if (relativeMatch) {
    const deltaSeconds = parseRelativeDurationToSeconds(relativeMatch[1]);
    if (deltaSeconds !== null) {
      return Math.floor(now / 1000) + deltaSeconds;
    }
  }
  const absoluteMatch = line.match(ABSOLUTE_RESET_RE);
  return absoluteMatch
    ? parseAbsoluteResetToEpochSeconds(absoluteMatch[1], now)
    : null;
}

function parseUsageWindow(line: string, now: number): ClaudeUsageWindow | null {
  const percentMatch = line.match(PERCENT_RE);
  if (!percentMatch) {
    return null;
  }
  const rawPercent = Number(percentMatch[1]);
  const qualifier = percentMatch[2].toLowerCase();
  const usedPercent =
    qualifier === "remaining" || qualifier === "left"
      ? 100 - rawPercent
      : rawPercent;

  return {
    usedPercent: Math.min(100, Math.max(0, usedPercent)),
    resetsAt: parseResetsAt(line, now),
  };
}

export function parseClaudeUsageReportText(rawText: string): {
  session: ClaudeUsageWindow | null;
  weekly: ClaudeUsageWindow | null;
  fableWeekly: ClaudeUsageWindow | null;
} {
  let session: ClaudeUsageWindow | null = null;
  let weekly: ClaudeUsageWindow | null = null;
  let fableWeekly: ClaudeUsageWindow | null = null;
  const now = Date.now();

  for (const line of rawText.split(/\r?\n/)) {
    if (FABLE_WEEKLY_LABEL_RE.test(line)) {
      fableWeekly ??= parseUsageWindow(line, now);
      continue;
    }
    if (SESSION_LABEL_RE.test(line)) {
      session ??= parseUsageWindow(line, now);
      continue;
    }
    if (WEEKLY_LABEL_RE.test(line)) {
      weekly ??= parseUsageWindow(line, now);
    }
  }

  return { session, weekly, fableWeekly };
}

export interface UsageReportCommand {
  executablePath: string;
  commandArgs: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

/**
 * Injectable so the command shape and the snapshot mapping can be unit-tested
 * without spawning a real CLI. Production always uses the default runner.
 */
export type UsageReportRunner = (
  command: UsageReportCommand,
) => Promise<string>;

function toProcessEnv(
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

const defaultUsageReportRunner: UsageReportRunner = (command) =>
  new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command.executablePath, command.commandArgs, {
        cwd: command.cwd,
        env: command.env,
        // stdin is explicitly /dev/null: print mode waits on it, so an open
        // pipe stalls the read until the CLI's own idle warning fires.
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (finish: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      finish();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill("SIGKILL");
        reject(
          new Error(
            `Claude CLI /usage timed out after ${command.timeoutMs}ms.`,
          ),
        );
      });
    }, command.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => {
      settle(() => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        const detail = stderr.trim();
        reject(
          new Error(
            `Claude CLI /usage exited with code ${code}${
              detail ? `: ${detail}` : ""
            }.`,
          ),
        );
      });
    });
  });

export function captureClaudeUsageReportText(
  executablePath: string,
  run: UsageReportRunner = defaultUsageReportRunner,
): Promise<string> {
  return run({
    executablePath,
    commandArgs: [...USAGE_COMMAND_ARGS],
    // Home rather than the Electron app's cwd, so a background poll never
    // adopts a project directory's settings or CLAUDE.md.
    cwd: homedir(),
    env: toProcessEnv(buildClaudeCliEnv({ executablePath })),
    timeoutMs: CAPTURE_TIMEOUT_MS,
  });
}

function unavailable(error: string): ClaudeUsageSnapshot {
  return {
    source: "unavailable",
    session: null,
    weekly: null,
    fableWeekly: null,
    error,
  };
}

/**
 * Fallback path for when the Claude OAuth usage endpoint is unavailable: run
 * `claude -p /usage` and parse the plain-text report. This mirrors what the CLI
 * itself reports, so it degrades gracefully — if the wording changes or nothing
 * readable comes back, this returns `source: "unavailable"` instead of throwing.
 */
export async function fetchClaudeUsageViaCli(options?: {
  resolveExecutablePath?: () => string | null;
  run?: UsageReportRunner;
}): Promise<ClaudeUsageSnapshot> {
  const resolvePath =
    options?.resolveExecutablePath ??
    (() => resolveClaudeCliExecutablePath() ?? null);
  const executablePath = resolvePath();
  if (!executablePath) {
    return unavailable("Claude CLI executable not found.");
  }

  try {
    const rawText = await captureClaudeUsageReportText(
      executablePath,
      options?.run,
    );
    const { session, weekly, fableWeekly } =
      parseClaudeUsageReportText(rawText);
    if (!session && !weekly && !fableWeekly) {
      return unavailable("Could not parse the Claude CLI /usage report.");
    }
    return { source: "cli", session, weekly, fableWeekly, error: null };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
