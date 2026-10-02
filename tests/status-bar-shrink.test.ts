import { describe, expect, test } from "bun:test";

import {
  FIVE_HOURS_MS,
  SEVEN_DAYS_MS,
  type UsageHeadlineWindow,
} from "../src/components/layout/status-bar-usage.utils";
import {
  buildUsageStripSegment,
  resolveUsageStripBreakpoint,
  resolveUsageStripTokensBreakpoint,
  type UsageStripSegmentModel,
} from "../src/components/layout/status-bar-usage-strip.utils";
import {
  RESOURCE_TRIGGER_FULL_REM,
  RESOURCE_TRIGGER_ICON_REM,
  STATUS_BAR_SHRINK_ORDER,
  estimateCompactUsageStripRem,
  resolveResourceLabelBreakpoint,
} from "../src/components/layout/status-bar-shrink";

const BAR_INSET_REM = 0.5;

function window(patch: Partial<UsageHeadlineWindow> = {}): UsageHeadlineWindow {
  return {
    short: "5h",
    label: "5h",
    title: "5-hour limit",
    note: null,
    usedPercent: 14,
    resetsAt: null,
    windowMs: FIVE_HOURS_MS,
    ...patch,
  };
}

const WEEK = window({ short: "7d", label: "7d", title: "Weekly limit", windowMs: SEVEN_DAYS_MS });

function segment(args: {
  provider?: "claude" | "codex" | "cursor" | "kiro";
  name: string;
  windows?: UsageHeadlineWindow[];
  pending?: boolean;
}): UsageStripSegmentModel {
  return buildUsageStripSegment({
    provider: args.provider ?? "claude",
    providerName: args.name,
    windows: args.windows ?? [window(), WEEK],
    account: null,
    spend: {
      providerId: "claude-code",
      todayUsd: 0.4,
      monthUsd: 12.5,
      monthTurns: 30,
      todayTokens: 2_400_000,
      monthTokens: 61_000_000,
      monthTokenTurns: 30,
    },
    stale: false,
    pending: args.pending ?? false,
  });
}

const CASES: Record<string, UsageStripSegmentModel[]> = {
  "one provider": [segment({ name: "Claude" })],
  "two providers": [segment({ name: "Claude" }), segment({ provider: "codex", name: "Codex" })],
  "four providers with accounts": [
    segment({ name: "Claude · Work account" }),
    segment({ provider: "codex", name: "Codex · Personal" }),
    segment({ provider: "cursor", name: "Cursor", windows: [window({ short: "" })] }),
    segment({ provider: "kiro", name: "Kiro", windows: [] , pending: true }),
  ],
  "one window each": [
    segment({ name: "Claude", windows: [window()] }),
    segment({ provider: "codex", name: "Codex", windows: [window()] }),
  ],
};

/** What the bar shows at a width, following the same rules the styles compile. */
function layoutAt(barRem: number, segments: UsageStripSegmentModel[]) {
  const fullStep = resolveUsageStripBreakpoint(segments);
  const tokensStep = resolveUsageStripTokensBreakpoint(segments);
  const labelStep = resolveResourceLabelBreakpoint({ segments, fullStripStep: fullStep });
  const labelShown = labelStep === "always" || barRem >= labelStep;
  const stripRem = barRem - BAR_INSET_REM - (labelShown ? RESOURCE_TRIGGER_FULL_REM : RESOURCE_TRIGGER_ICON_REM);
  const stripFull = fullStep !== "never" && stripRem >= fullStep;
  const tokensShown = tokensStep !== "never" && stripRem >= tokensStep;
  return { labelShown, stripFull, tokensShown, stripRem };
}

describe("status bar shrink order", () => {
  test("names the order: usage detail, then the Resource Manager label, then clipping", () => {
    expect(STATUS_BAR_SHRINK_ORDER).toEqual(["usage-tokens", "usage-detail", "resource-label", "usage-clip"]);
  });

  for (const [name, segments] of Object.entries(CASES)) {
    test(`${name}: each step gives way once, in order, as the bar narrows`, () => {
      let sawCompact = false;
      let sawIconOnly = false;
      let sawNoTokens = false;
      for (let bar = 200; bar >= 30; bar -= 0.25) {
        const { labelShown, stripFull, tokensShown } = layoutAt(bar, segments);
        // Tokens only ever sit beside the full form, so they go first…
        if (!stripFull) expect(tokensShown).toBe(false);
        // …the label never goes while the strip still has its full form…
        if (!labelShown) expect(stripFull).toBe(false);
        // …and no step comes back as the bar keeps narrowing.
        if (sawNoTokens) expect(tokensShown).toBe(false);
        if (sawCompact) expect(stripFull).toBe(false);
        if (sawIconOnly) expect(labelShown).toBe(false);
        if (!tokensShown) sawNoTokens = true;
        if (!stripFull) sawCompact = true;
        if (!labelShown) sawIconOnly = true;
      }
      expect(sawCompact).toBe(true);
    });

    test(`${name}: the label goes before the compact meter would run into it`, () => {
      const compact = estimateCompactUsageStripRem(segments);
      for (let bar = 200; bar >= 30; bar -= 0.25) {
        const { labelShown, stripFull, stripRem } = layoutAt(bar, segments);
        if (labelShown && !stripFull) expect(stripRem).toBeGreaterThanOrEqual(compact);
      }
    });
  }

  test("with no usage providers the label stays until the bar is very narrow", () => {
    const step = resolveResourceLabelBreakpoint({ segments: [], fullStripStep: resolveUsageStripBreakpoint([]) });
    expect(step === "always" || step <= 32).toBe(true);
  });
});
