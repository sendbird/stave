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
  describeTurnTokenCounting,
  describeTurnTokens,
  describeUsageSegmentForAssistiveTech,
  describeUsageWindow,
  estimateUsageStripRem,
  formatResetClock,
  formatResetCountdown,
  formatStripTokens,
  formatWindowContext,
  resolveQuotaRingArc,
  resolveTimeLeftHand,
  resolveUsageStripBreakpoint,
  resolveUsageStripTokensBreakpoint,
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

const CLAUDE_SPEND = {
  providerId: "claude-code" as const,
  todayUsd: 0.1,
  monthUsd: 4.2,
  monthTurns: 12,
  todayTokens: 1_240_000,
  monthTokens: 18_000_000,
  monthTokenTurns: 14,
};

describe("strip segment", () => {
  test("names the account, carries tokens, and keeps cost only where a provider reported one", () => {
    const segment = buildUsageStripSegment({
      provider: "claude",
      providerName: "Claude",
      windows: [window()],
      account: subscription,
      spend: CLAUDE_SPEND,
      stale: false,
      pending: false,
    });
    expect(segment.name).toBe("Claude · Work");
    expect(segment.tokens).toEqual({ todayTokens: 1_240_000, monthTokens: 18_000_000, monthTurns: 14 });
    expect(segment.cost).toEqual({ todayUsd: 0.1, monthUsd: 4.2, monthTurns: 12, meaning: "api-value" });
    expect(describeUsageSegmentForAssistiveTech(segment, NOW)).toBe(
      "Claude · Work usage: 5-hour limit 14% used, resets in 1h 7m; 1.2M tokens today",
    );

    // Codex reports tokens only: it gets the tokens item and no cost.
    const codex = buildUsageStripSegment({
      provider: "codex",
      providerName: "Codex",
      windows: [window()],
      account: null,
      spend: { providerId: "codex", todayUsd: 0, monthUsd: 0, monthTurns: 0, todayTokens: 0, monthTokens: 52_000, monthTokenTurns: 3 },
      stale: false,
      pending: false,
    });
    expect(codex.name).toBe("Codex");
    expect(codex.tokens).toEqual({ todayTokens: 0, monthTokens: 52_000, monthTurns: 3 });
    expect(codex.cost).toBeNull();

    const none = buildUsageStripSegment({
      provider: "codex",
      providerName: "Codex",
      windows: [window()],
      account: null,
      spend: undefined,
      stale: false,
      pending: false,
    });
    expect(none.tokens).toBeNull();
    expect(none.cost).toBeNull();
  });

  test("a provider waiting on its first reading says so; a gateway never waits", () => {
    const reading = buildUsageStripSegment({
      provider: "codex",
      providerName: "Codex",
      windows: [],
      account: null,
      spend: undefined,
      stale: false,
      pending: true,
    });
    expect(reading.pending).toBe(true);
    expect(describeUsageSegmentForAssistiveTech(reading, NOW)).toBe("Codex usage: reading usage");
    const gateway = buildUsageStripSegment({
      provider: "claude",
      providerName: "Claude",
      windows: [],
      account: { ...subscription, triggerLabel: "API billing", gateway: true },
      spend: undefined,
      stale: false,
      pending: true,
    });
    expect(gateway.pending).toBe(false);
    const withNumbers = buildUsageStripSegment({
      provider: "codex",
      providerName: "Codex",
      windows: [window()],
      account: null,
      spend: undefined,
      stale: false,
      pending: true,
    });
    expect(withNumbers.pending).toBe(false);
  });

  test("a gateway has no quota windows and its cost is spend", () => {
    const segment = buildUsageStripSegment({
      provider: "claude",
      providerName: "Claude",
      windows: [window()],
      account: { ...subscription, triggerLabel: "API billing", gateway: true },
      spend: { ...CLAUDE_SPEND, todayUsd: 1.5, monthUsd: 30, monthTurns: 40, todayTokens: 950 },
      stale: false,
      pending: false,
    });
    expect(segment.windows).toEqual([]);
    expect(segment.cost?.meaning).toBe("spend");
    // The bar names tokens, not dollars; the popover has the spend.
    expect(describeUsageSegmentForAssistiveTech(segment, NOW)).toBe(
      "Claude · API billing usage: 950 tokens today",
    );
  });

  test("the bar shows tokens compactly and the hint says which tokens count", () => {
    const tokens = { todayTokens: 1_240_000, monthTokens: 18_000_000, monthTurns: 1 };
    expect(formatStripTokens(tokens)).toEqual({ amount: "1.2M", context: "tok today · 18M mo" });
    expect(formatStripTokens({ todayTokens: 0, monthTokens: 950, monthTurns: 2 })).toEqual({
      amount: "0",
      context: "tok today · 950 mo",
    });
    const cost = { todayUsd: 0.1, monthUsd: 4.2, monthTurns: 1, meaning: "api-value" as const };
    const hint = describeTurnTokens({ tokens, cost, provider: "claude", providerName: "Claude", multipleAccounts: true });
    expect(hint.title).toBe("Tokens in turns run in Stave");
    expect(hint.lines).toEqual([
      "1.2M today, 18M this month, from 1 turn.",
      "Counts input and output tokens. Prompt tokens read from the cache are left out.",
      "Includes turns from every Claude account.",
      "Click for their API value.",
    ]);
    // No dollars anywhere in the bar's hint, even when a cost was reported.
    expect(hint.lines.join(" ")).not.toContain("$");
    expect(
      describeTurnTokens({ tokens, cost: { ...cost, meaning: "spend" }, provider: "claude", providerName: "Claude", multipleAccounts: false }).lines,
    ).toEqual([
      "1.2M today, 18M this month, from 1 turn.",
      "Counts input and output tokens. Prompt tokens read from the cache are left out.",
      "Click for their spend.",
    ]);
    expect(describeTurnTokens({ tokens, cost: null, provider: "codex", providerName: "Codex", multipleAccounts: false }).lines).toHaveLength(2);
    // Cache conventions are verified for Claude and Codex only.
    expect(describeTurnTokenCounting({ provider: "kiro", providerName: "Kiro" })).toBe(
      "Counts input and output tokens as Kiro reports them.",
    );
  });

  test("cost copy says what kind of number it is", () => {
    const cost = { todayUsd: 0.1, monthUsd: 4.2, monthTurns: 1, meaning: "api-value" as const };
    const value = describeTurnSpend({ cost, providerName: "Claude" });
    expect(value.title).toBe("API value of turns run in Stave");
    expect(value.lines).toEqual([
      "$0.10 today, $4.20 this month, from 1 turn.",
      "Not billed to your subscription. Claude estimates it from token use at API prices.",
    ]);
    const spend = describeTurnSpend({ cost: { ...cost, meaning: "spend" }, providerName: "Claude" });
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
      tokens: { todayTokens: 1_240_000, monthTokens: 18_000_000, monthTurns: 3 },
      cost: { todayUsd: 0.1, monthUsd: 4.2, monthTurns: 3, meaning: "api-value" },
      gateway: false,
      stale: false,
      pending: false,
      ...patch,
    };
  }

  test("picks the narrowest step that fits every provider", () => {
    const one = resolveUsageStripBreakpoint([segment()]);
    const two = resolveUsageStripBreakpoint([
      segment(),
      segment({ provider: "codex", providerName: "Codex", name: "Codex", tokens: null, cost: null }),
    ]);
    expect(typeof one).toBe("number");
    expect(typeof two).toBe("number");
    expect(two as number).toBeGreaterThan(one as number);
    const needed = estimateUsageStripRem([segment()], { tokens: false });
    expect(one as number).toBeGreaterThanOrEqual(needed);
    const previous = USAGE_STRIP_BREAKPOINTS_REM[USAGE_STRIP_BREAKPOINTS_REM.indexOf(one as never) - 1];
    if (previous !== undefined) expect(previous).toBeLessThan(needed);
  });

  test("does not flip as a countdown ticks or a percent gains a digit", () => {
    const early = segment({ windows: [window({ usedPercent: 9, resetsAt: at(4 * 3_600_000 + 59 * 60_000) })] });
    const late = segment({ windows: [window({ usedPercent: 100, resetsAt: at(60_000) })] });
    expect(estimateUsageStripRem([early])).toBe(estimateUsageStripRem([late]));
  });

  test("does not flip as today's tokens grow, and only tokens take room", () => {
    const quiet = segment({ tokens: { todayTokens: 0, monthTokens: 9, monthTurns: 1 } });
    const busy = segment({ tokens: { todayTokens: 412_300_000, monthTokens: 987_600_000, monthTurns: 900 } });
    expect(estimateUsageStripRem([quiet])).toBe(estimateUsageStripRem([busy]));
    // The cost is in the popover only, so it never widens the bar.
    expect(estimateUsageStripRem([segment({ cost: null })])).toBe(estimateUsageStripRem([segment()]));
    expect(estimateUsageStripRem([segment({ tokens: null })])).toBeLessThan(estimateUsageStripRem([segment()]));
  });

  test("tokens take their own, wider step, so they give way before the windows", () => {
    const pair = [segment(), segment({ provider: "codex", providerName: "Codex", name: "Codex" })];
    const full = resolveUsageStripBreakpoint(pair) as number;
    const tokens = resolveUsageStripTokensBreakpoint(pair) as number;
    expect(tokens).toBeGreaterThan(full);
    expect(tokens).toBeGreaterThanOrEqual(estimateUsageStripRem(pair, { tokens: true }));
    // Two providers with tokens on a 1280px window (a ~71rem strip) keep their rings.
    expect(full).toBeLessThanOrEqual(71);
    // Without tokens to show, both steps are the same.
    const quiet = pair.map((entry) => ({ ...entry, tokens: null }));
    expect(resolveUsageStripTokensBreakpoint(quiet)).toBe(resolveUsageStripBreakpoint(quiet));
  });

  test("stays compact when even the widest step is too narrow", () => {
    expect(resolveUsageStripBreakpoint(Array.from({ length: 8 }, () => segment()))).toBe("never");
  });

  test("an empty bar needs no room", () => {
    expect(estimateUsageStripRem([])).toBe(0);
  });
});
