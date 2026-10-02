import { describe, expect, test } from "bun:test";

import {
  FIVE_HOURS_MS,
  SEVEN_DAYS_MS,
  type StatusBarAccountView,
  type UsageHeadlineWindow,
} from "../src/components/layout/status-bar-usage.utils";
import {
  USAGE_STRIP_BREAKPOINTS_REM,
  buildUsageStripSegment,
  describeTurnSpend,
  describeUsageSegmentForAssistiveTech,
  describeUsageWindow,
  estimateUsageStripRem,
  formatResetClock,
  formatResetCountdown,
  formatStripCost,
  formatWindowContext,
  resolveQuotaRingArc,
  resolveTimeLeftHand,
  resolveUsageStripBreakpoint,
  usageTone,
  type UsageStripSegmentModel,
} from "../src/components/layout/status-bar-usage-strip.utils";

const NOW = new Date(2026, 9, 2, 14, 35).getTime();
const at = (ms: number) => (NOW + ms) / 1000;

function window(patch: Partial<UsageHeadlineWindow> = {}): UsageHeadlineWindow {
  return {
    short: "5h",
    label: "5h",
    title: "5-hour limit",
    note: null,
    usedPercent: 14,
    resetsAt: at(67 * 60_000),
    windowMs: FIVE_HOURS_MS,
    ...patch,
  };
}

describe("quota ring", () => {
  test("the arc is the used share of the circumference", () => {
    const { circumference, filled } = resolveQuotaRingArc({ usedPercent: 25, radius: 6 });
    expect(circumference).toBeCloseTo(2 * Math.PI * 6);
    expect(filled).toBeCloseTo(circumference / 4);
  });

  test("clamps out-of-range and non-finite percents", () => {
    expect(resolveQuotaRingArc({ usedPercent: 140, radius: 6 }).filled).toBeCloseTo(2 * Math.PI * 6);
    expect(resolveQuotaRingArc({ usedPercent: -5, radius: 6 }).filled).toBe(0);
    expect(resolveQuotaRingArc({ usedPercent: Number.NaN, radius: 6 }).filled).toBe(0);
  });

  test("tones by the shared 60/85 thresholds", () => {
    expect(usageTone(0)).toBe("ok");
    expect(usageTone(59.9)).toBe("ok");
    expect(usageTone(60)).toBe("warn");
    expect(usageTone(84.9)).toBe("warn");
    expect(usageTone(85)).toBe("danger");
    expect(usageTone(250)).toBe("danger");
  });
});

describe("time-left hand", () => {
  test("a fresh window draws a full face with the hand at 12", () => {
    const hand = resolveTimeLeftHand({ timeLeftRatio: 1, center: 8, radius: 4 });
    expect(hand.wedge.kind).toBe("full");
    expect(hand.handX).toBeCloseTo(8);
    expect(hand.handY).toBeCloseTo(4);
  });

  test("a quarter elapsed puts the hand at 3 o'clock with a large wedge", () => {
    const hand = resolveTimeLeftHand({ timeLeftRatio: 0.75, center: 8, radius: 4 });
    expect(hand.handX).toBeCloseTo(12);
    expect(hand.handY).toBeCloseTo(8);
    expect(hand.wedge).toEqual({ kind: "path", d: expect.stringContaining(" 0 1 1 8 4 Z") });
  });

  test("an elapsed window draws no wedge", () => {
    expect(resolveTimeLeftHand({ timeLeftRatio: 0, center: 8, radius: 4 }).wedge.kind).toBe("none");
  });
});

describe("reset formatting", () => {
  test("counts down in the two largest units", () => {
    expect(formatResetCountdown(at(30_000), NOW)).toBe("<1m");
    expect(formatResetCountdown(at(42 * 60_000), NOW)).toBe("42m");
    expect(formatResetCountdown(at(67 * 60_000), NOW)).toBe("1h 7m");
    expect(formatResetCountdown(at(2 * 3_600_000), NOW)).toBe("2h");
    expect(formatResetCountdown(at(76 * 3_600_000 + 59 * 60_000), NOW)).toBe("3d 4h");
    expect(formatResetCountdown(at(48 * 3_600_000), NOW)).toBe("2d");
  });

  test("says when a reset has passed or was never reported", () => {
    expect(formatResetCountdown(at(-1), NOW)).toBe("now");
    expect(formatResetCountdown(null, NOW)).toBeNull();
    expect(formatResetCountdown(Number.NaN, NOW)).toBeNull();
  });

  test("names the wall-clock time, with a weekday or date once it is not today", () => {
    expect(formatResetClock(at(67 * 60_000), NOW, "en-US")).toBe("3:42 PM");
    const monday = new Date(2026, 9, 5, 9, 0).getTime() / 1000;
    expect(formatResetClock(monday, NOW, "en-US")).toBe("Mon 9:00 AM");
    const later = new Date(2026, 9, 20, 9, 0).getTime() / 1000;
    // ICU versions differ on the joiner (", " or " at "), so check the parts.
    expect(formatResetClock(later, NOW, "en-US")).toContain("Oct 20");
    expect(formatResetClock(later, NOW, "en-US")).toContain("9:00 AM");
  });

  test("the strip context is the window tag and the countdown", () => {
    expect(formatWindowContext(window(), NOW)).toBe("5h · resets 1h 7m");
    expect(formatWindowContext(window({ label: "" }), NOW)).toBe("resets 1h 7m");
    expect(formatWindowContext(window({ resetsAt: null }), NOW)).toBe("5h");
  });
});

describe("usage hints", () => {
  test("say what the window is, when it resets and what 100% does", () => {
    const hint = describeUsageWindow({
      window: window({ title: "Weekly limit", usedPercent: 83, resetsAt: at(67 * 60_000), windowMs: SEVEN_DAYS_MS }),
      providerName: "Claude",
      blockAtLimit: true,
      now: NOW,
      locale: "en-US",
    });
    expect(hint.title).toBe("Weekly limit · 83% used");
    expect(hint.lines).toEqual([
      "Resets in 1h 7m (3:42 PM).",
      "At 100%, Stave holds new Claude turns until it resets. Running turns finish.",
    ]);
  });

  test("follow the 100% setting and carry a window's own note", () => {
    const hint = describeUsageWindow({
      window: window({ note: "Counts Fable models only.", resetsAt: null }),
      providerName: "Claude",
      blockAtLimit: false,
      now: NOW,
    });
    expect(hint.lines).toEqual([
      "Counts Fable models only.",
      "Claude did not report when this resets.",
      "At 100%, Stave keeps sending Claude turns, because Stop turns at 100% usage is off.",
    ]);
  });
});

const subscription: StatusBarAccountView = {
  options: [],
  selected: null,
  triggerLabel: "Work",
  gateway: false,
  canSwitch: true,
};

describe("strip segment", () => {
  test("names the account and keeps cost only where a provider reported one", () => {
    const segment = buildUsageStripSegment({
      provider: "claude",
      providerName: "Claude",
      windows: [window()],
      account: subscription,
      spend: { providerId: "claude-code", todayUsd: 0.1, monthUsd: 4.2, monthTurns: 12 },
      stale: false,
    });
    expect(segment.name).toBe("Claude · Work");
    expect(segment.cost).toEqual({ todayUsd: 0.1, monthUsd: 4.2, monthTurns: 12, meaning: "api-value" });

    const codex = buildUsageStripSegment({
      provider: "codex",
      providerName: "Codex",
      windows: [window()],
      account: null,
      spend: undefined,
      stale: false,
    });
    expect(codex.name).toBe("Codex");
    expect(codex.cost).toBeNull();
  });

  test("a gateway has no quota windows and its cost is spend", () => {
    const segment = buildUsageStripSegment({
      provider: "claude",
      providerName: "Claude",
      windows: [window()],
      account: { ...subscription, triggerLabel: "API billing", gateway: true },
      spend: { providerId: "claude-code", todayUsd: 1.5, monthUsd: 30, monthTurns: 40 },
      stale: false,
    });
    expect(segment.windows).toEqual([]);
    expect(segment.cost?.meaning).toBe("spend");
    expect(describeUsageSegmentForAssistiveTech(segment, NOW)).toBe(
      "Claude · API billing usage: $1.50 today",
    );
  });

  test("cost copy says what kind of number it is", () => {
    const cost = { todayUsd: 0.1, monthUsd: 4.2, monthTurns: 1, meaning: "api-value" as const };
    expect(formatStripCost(cost)).toEqual({ amount: "$0.10", context: "today · $4.20 this month" });
    const value = describeTurnSpend({ cost, providerName: "Claude", multipleAccounts: true });
    expect(value.title).toBe("API value of turns run in Stave");
    expect(value.lines).toEqual([
      "$0.10 today, $4.20 this month, from 1 turn.",
      "Not billed to your subscription. Claude estimates it from token use at API prices.",
      "Includes turns from every Claude account.",
    ]);
    const spend = describeTurnSpend({ cost: { ...cost, meaning: "spend" }, providerName: "Claude", multipleAccounts: false });
    expect(spend.title).toBe("Spend on turns run in Stave");
    expect(spend.lines).toHaveLength(2);
  });
});

describe("responsive mode", () => {
  function segment(patch: Partial<UsageStripSegmentModel> = {}): UsageStripSegmentModel {
    return {
      provider: "claude",
      providerName: "Claude",
      name: "Claude · Work",
      windows: [window(), window({ short: "7d", label: "7d", title: "Weekly limit" })],
      cost: { todayUsd: 0.1, monthUsd: 4.2, monthTurns: 3, meaning: "api-value" },
      gateway: false,
      stale: false,
      ...patch,
    };
  }

  test("picks the narrowest step that fits every provider", () => {
    const one = resolveUsageStripBreakpoint([segment()]);
    const two = resolveUsageStripBreakpoint([
      segment(),
      segment({ provider: "codex", providerName: "Codex", name: "Codex", cost: null }),
    ]);
    expect(typeof one).toBe("number");
    expect(typeof two).toBe("number");
    expect(two as number).toBeGreaterThan(one as number);
    const needed = estimateUsageStripRem([segment()]);
    expect(one as number).toBeGreaterThanOrEqual(needed);
    const previous = USAGE_STRIP_BREAKPOINTS_REM[USAGE_STRIP_BREAKPOINTS_REM.indexOf(one as never) - 1];
    if (previous !== undefined) expect(previous).toBeLessThan(needed);
  });

  test("does not flip as a countdown ticks or a percent gains a digit", () => {
    const early = segment({ windows: [window({ usedPercent: 9, resetsAt: at(4 * 3_600_000 + 59 * 60_000) })] });
    const late = segment({ windows: [window({ usedPercent: 100, resetsAt: at(60_000) })] });
    expect(estimateUsageStripRem([early])).toBe(estimateUsageStripRem([late]));
  });

  test("stays compact when even the widest step is too narrow", () => {
    expect(resolveUsageStripBreakpoint(Array.from({ length: 8 }, () => segment()))).toBe("never");
  });

  test("an empty bar needs no room", () => {
    expect(estimateUsageStripRem([])).toBe(0);
  });
});
