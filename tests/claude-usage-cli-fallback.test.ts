import { describe, expect, test } from "bun:test";
import {
  parseClaudeUsagePanelText,
  stripAnsiEscapes,
} from "../electron/providers/rate-limits/claude-usage-cli-fallback";

describe("parseClaudeUsagePanelText", () => {
  test("parses remaining-style session and weekly windows", () => {
    const raw = [
      "Plan usage limits",
      "",
      "Current session",
      "18% remaining",
      "Resets in 2h 10m",
      "",
      "Current week (all models)",
      "84% left",
      "Resets in 5d 4h",
    ].join("\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session).not.toBeNull();
    expect(session?.usedPercent).toBe(82);
    expect(session?.resetsAt).not.toBeNull();

    expect(weekly).not.toBeNull();
    expect(weekly?.usedPercent).toBe(16);
    expect(weekly?.resetsAt).not.toBeNull();
  });

  test("parses used/consumed-style wording and newer weekly labels", () => {
    const raw = [
      "Current session",
      "42% used",
      "Resets in 3h",
      "",
      "Weekly limits",
      "60% consumed",
      "Resets in 2d",
    ].join("\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session?.usedPercent).toBe(42);
    expect(weekly?.usedPercent).toBe(60);
  });

  test("returns nulls when no recognizable sections are present", () => {
    const { session, weekly } = parseClaudeUsagePanelText(
      "Welcome to Claude Code\n\nType /help for more information.",
    );
    expect(session).toBeNull();
    expect(weekly).toBeNull();
  });

  test("parses PTY output interleaved with ANSI escape sequences", () => {
    const raw = [
      "\x1b[2J\x1b[H\x1b[38;5;114mPlan usage limits\x1b[0m",
      "\x1b[2K",
      "│ \x1b[1mCurrent session\x1b[22m",
      "│ \x1b[38;5;208m█████░░░░░\x1b[0m 18% \x1b[2mremaining\x1b[22m",
      "│ Resets in 2h 10m\x1b[0m",
      "│",
      "│ \x1b[1mCurrent week (all models)\x1b[22m",
      "│ 84% left \x1b]0;claude\x07",
      "│ Resets in 5d 4h",
    ].join("\r\n");

    const { session, weekly } = parseClaudeUsagePanelText(raw);

    expect(session?.usedPercent).toBe(82);
    expect(weekly?.usedPercent).toBe(16);
  });

  test("stripAnsiEscapes removes CSI/OSC sequences but keeps text", () => {
    expect(stripAnsiEscapes("\x1b[1mhello\x1b[0m \x1b]0;title\x07world")).toBe(
      "hello world",
    );
  });

  test("does not confuse a session-only panel with a weekly window", () => {
    const raw = ["Current session", "10% remaining", "Resets in 1h"].join(
      "\n",
    );
    const { session, weekly } = parseClaudeUsagePanelText(raw);
    expect(session?.usedPercent).toBe(90);
    expect(weekly).toBeNull();
  });
});
