import { describe, expect, test } from "bun:test";

import {
  buildUsageHeadlineWindows,
  headlineUsagePercent,
} from "../src/components/layout/status-bar-usage.utils";
import type {
  ClaudeUsageSnapshot,
  CodexUsageSnapshot,
} from "../src/lib/providers/provider.types";

function claudeSnapshot(
  patch: Partial<ClaudeUsageSnapshot> = {},
): ClaudeUsageSnapshot {
  return {
    source: "oauth",
    session: { usedPercent: 45, resetsAt: null },
    weekly: { usedPercent: 72, resetsAt: null },
    fableWeekly: null,
    error: null,
    ...patch,
  };
}

describe("status bar usage headline", () => {
  test("shows the weekly window alongside the 5h window", () => {
    expect(
      buildUsageHeadlineWindows({ provider: "claude", claude: claudeSnapshot() }),
    ).toEqual([
      { short: "5h", usedPercent: 45 },
      { short: "7d", usedPercent: 72 },
    ]);
  });

  test("includes the model-specific weekly window when reported", () => {
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({
          fableWeekly: { usedPercent: 12, resetsAt: null },
        }),
      }),
    ).toHaveLength(3);
  });

  test("omits windows the snapshot does not report", () => {
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({ session: null }),
      }),
    ).toEqual([{ short: "7d", usedPercent: 72 }]);
    expect(
      buildUsageHeadlineWindows({
        provider: "claude",
        claude: claudeSnapshot({
          source: "unavailable",
          error: "not signed in",
        }),
      }),
    ).toEqual([]);
  });

  test("keeps Codex collapsed to its first bucket", () => {
    const codex: CodexUsageSnapshot = {
      source: "rpc",
      buckets: [
        {
          limitId: "primary",
          limitName: "Plan",
          planType: "pro",
          primary: { usedPercent: 31, resetsAt: null },
          secondary: null,
          individualLimit: null,
          credits: null,
        },
      ],
      error: null,
    };
    expect(buildUsageHeadlineWindows({ provider: "codex", codex })).toEqual([
      { short: "", usedPercent: 31 },
    ]);
  });

  test("tones the dot by the window closest to its limit", () => {
    expect(headlineUsagePercent(buildUsageHeadlineWindows({
      provider: "claude",
      claude: claudeSnapshot(),
    }))).toBe(72);
    expect(headlineUsagePercent([])).toBeNull();
  });
});
