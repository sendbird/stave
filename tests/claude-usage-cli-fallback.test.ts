import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import {
  captureClaudeUsageReportText,
  fetchClaudeUsageViaCli,
  parseAbsoluteResetToEpochSeconds,
  parseClaudeUsageReportText,
  type UsageReportCommand,
  type UsageReportRunner,
} from "../electron/providers/rate-limits/claude-usage-cli-fallback";

/**
 * Verbatim `claude -p /usage` output (CLI 2.1.221), including the trailing
 * "behaviors" section whose "16% of your usage ..." lines previously made a
 * percent-anywhere parser report the wrong number.
 */
const USAGE_REPORT_TEXT = [
  "You are currently using your subscription to power your Claude Code usage",
  "",
  "Current session: 7% used · resets Aug 5 at 9:10am (Asia/Seoul)",
  "Current week (all models): 33% used · resets Aug 7 at 7:59am (Asia/Seoul)",
  "Current week (Fable): 19% used · resets Aug 7 at 7:59am (Asia/Seoul)",
  "",
  "What's contributing to your limits usage?",
  "Approximate, based on local sessions on this machine.",
  "",
  "Last 24h · 342 requests · 23 sessions",
  "  16% of your usage came from subagent-heavy sessions",
  "  11% of your usage was at >150k context",
].join("\n");

describe("parseClaudeUsageReportText", () => {
  test("reads every window from the current non-interactive report", () => {
    const { session, weekly, fableWeekly } =
      parseClaudeUsageReportText(USAGE_REPORT_TEXT);

    expect(session?.usedPercent).toBe(7);
    expect(weekly?.usedPercent).toBe(33);
    expect(fableWeekly?.usedPercent).toBe(19);
    expect(session?.resetsAt).not.toBeNull();
    expect(weekly?.resetsAt).not.toBeNull();
    expect(fableWeekly?.resetsAt).not.toBeNull();
  });

  test("keeps the Fable window out of the all-models weekly slot", () => {
    // "Current week (Fable)" also satisfies a naive "current week" matcher, so
    // without the Fable branch running first the model-scoped number would be
    // reported as the account-wide weekly limit.
    const { weekly, fableWeekly } = parseClaudeUsageReportText(
      [
        "Current week (Fable): 19% used · resets Aug 7 at 7:59am (Asia/Seoul)",
        "Current week (all models): 33% used · resets Aug 7 at 7:59am (Asia/Seoul)",
      ].join("\n"),
    );

    expect(weekly?.usedPercent).toBe(33);
    expect(fableWeekly?.usedPercent).toBe(19);
  });

  test("ignores the behavior-breakdown percentages", () => {
    const { session, weekly, fableWeekly } = parseClaudeUsageReportText(
      [
        "Last 24h · 342 requests · 23 sessions",
        "  16% of your usage came from subagent-heavy sessions",
        "  11% of your usage was at >150k context",
      ].join("\n"),
    );

    expect(session).toBeNull();
    expect(weekly).toBeNull();
    expect(fableWeekly).toBeNull();
  });

  test("inverts remaining-style wording and still accepts relative resets", () => {
    const { session, weekly } = parseClaudeUsageReportText(
      [
        "Current session: 18% remaining · resets in 2h 10m",
        "Current week (all models): 84% left · resets in 5d 4h",
      ].join("\n"),
    );

    expect(session?.usedPercent).toBe(82);
    expect(weekly?.usedPercent).toBe(16);
    expect(session?.resetsAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("returns nulls when the CLI printed something else entirely", () => {
    const { session, weekly, fableWeekly } = parseClaudeUsageReportText(
      "Welcome to Claude Code\n\nType /help for more information.",
    );

    expect(session).toBeNull();
    expect(weekly).toBeNull();
    expect(fableWeekly).toBeNull();
  });
});

describe("parseAbsoluteResetToEpochSeconds", () => {
  // Local-time construction on both sides keeps these assertions independent of
  // the host timezone.
  const now = new Date(2026, 7, 5, 10, 0, 0).getTime();

  test("reads the 'at' separator and drops the trailing IANA zone", () => {
    expect(
      parseAbsoluteResetToEpochSeconds("Aug 7 at 7:59am (Asia/Seoul)", now),
    )
      // Previously the "at 7:59am (Asia/Seoul)" tail failed to parse and the
      // label silently degraded to midnight — an 8h-wrong reset countdown.
      .toBe(Math.floor(new Date(2026, 7, 7, 7, 59, 0, 0).getTime() / 1000));
  });

  test("rolls a time-only label that already passed to the next day", () => {
    expect(parseAbsoluteResetToEpochSeconds("9:10am (Asia/Seoul)", now)).toBe(
      Math.floor(new Date(2026, 7, 6, 9, 10, 0, 0).getTime() / 1000),
    );
  });

  test("still parses the comma-separated label older builds printed", () => {
    expect(parseAbsoluteResetToEpochSeconds("Dec 31, 12:00pm", now)).toBe(
      Math.floor(new Date(2026, 11, 31, 12, 0, 0, 0).getTime() / 1000),
    );
  });
});

describe("captureClaudeUsageReportText", () => {
  test("runs the CLI non-interactively with MCP startup suppressed", async () => {
    const commands: UsageReportCommand[] = [];
    const run: UsageReportRunner = (command) => {
      commands.push(command);
      return Promise.resolve(USAGE_REPORT_TEXT);
    };

    const text = await captureClaudeUsageReportText("/bin/claude", run);

    expect(text).toBe(USAGE_REPORT_TEXT);
    expect(commands).toHaveLength(1);
    // `-p` is what skips the workspace-trust dialog that used to swallow the
    // slash command in the old interactive-PTY capture, and
    // `--strict-mcp-config` keeps a status-bar poll from booting the user's
    // MCP servers as a side effect.
    expect(commands[0]?.commandArgs).toEqual([
      "--strict-mcp-config",
      "-p",
      "/usage",
    ]);
    expect(commands[0]?.executablePath).toBe("/bin/claude");
    expect(commands[0]?.cwd).toBe(homedir());
    expect(commands[0]?.timeoutMs).toBeGreaterThan(0);
  });
});

describe("fetchClaudeUsageViaCli", () => {
  test("reports the parsed windows with a cli source", async () => {
    const snapshot = await fetchClaudeUsageViaCli({
      resolveExecutablePath: () => "/bin/claude",
      run: () => Promise.resolve(USAGE_REPORT_TEXT),
    });

    expect(snapshot.source).toBe("cli");
    expect(snapshot.session?.usedPercent).toBe(7);
    expect(snapshot.weekly?.usedPercent).toBe(33);
    expect(snapshot.fableWeekly?.usedPercent).toBe(19);
    expect(snapshot.error).toBeNull();
  });

  test("degrades to unavailable when the CLI output is unparseable", async () => {
    const snapshot = await fetchClaudeUsageViaCli({
      resolveExecutablePath: () => "/bin/claude",
      run: () => Promise.resolve("Invalid API key"),
    });

    expect(snapshot.source).toBe("unavailable");
    expect(snapshot.session).toBeNull();
    expect(snapshot.error).toBeTruthy();
  });

  test("surfaces a spawn failure instead of throwing", async () => {
    const snapshot = await fetchClaudeUsageViaCli({
      resolveExecutablePath: () => "/bin/claude",
      run: () => Promise.reject(new Error("Claude CLI /usage timed out")),
    });

    expect(snapshot.source).toBe("unavailable");
    expect(snapshot.error).toContain("timed out");
  });

  test("reports a missing CLI without spawning anything", async () => {
    let spawned = false;
    const snapshot = await fetchClaudeUsageViaCli({
      resolveExecutablePath: () => null,
      run: () => {
        spawned = true;
        return Promise.resolve(USAGE_REPORT_TEXT);
      },
    });

    expect(spawned).toBe(false);
    expect(snapshot.source).toBe("unavailable");
    expect(snapshot.error).toBe("Claude CLI executable not found.");
  });
});
