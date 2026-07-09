import { describe, expect, test } from "bun:test";
import { parseClaudeUsagePanelText } from "../electron/providers/rate-limits/claude-usage-cli-fallback";

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

  test("does not confuse a session-only panel with a weekly window", () => {
    const raw = ["Current session", "10% remaining", "Resets in 1h"].join(
      "\n",
    );
    const { session, weekly } = parseClaudeUsagePanelText(raw);
    expect(session?.usedPercent).toBe(90);
    expect(weekly).toBeNull();
  });
});
