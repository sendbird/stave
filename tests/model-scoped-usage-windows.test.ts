import { describe, expect, test } from "bun:test";
import {
  emptyRateLimitsSnapshot,
  resolveEarliestAccountUsageResetAtMs,
  resolveTightestAccountUsageWindow,
} from "../src/lib/providers/account-usage-block";
import {
  buildStarterProfile,
  resolveRoute,
  resolveRouteTierForModel,
} from "../src/lib/providers/auto-routing-profile";
import type { ProviderId, RateLimitsSnapshotResponse } from "../src/lib/providers/provider.types";
import { computeRouterSignals, resolveExhaustedRouteModels } from "../src/lib/routing/auto-routing";
import { parseClaudeUsageReportText } from "../electron/providers/rate-limits/claude-usage-cli-fallback";
import {
  buildUsageHeadlineWindows,
  headlineUsagePercent,
} from "../src/components/layout/status-bar-usage.utils";
import { describeUsageWindow } from "../src/components/layout/status-bar-usage-strip.utils";
import { buildTaskExecutionSummary } from "../src/lib/fleet/task-execution-summary";
import { summarizeProviderUsage } from "../electron/host-service/supervision/provider-usage-context";
import type { ChatMessage } from "../src/types/chat";

// Usage guards read the wall clock, so the fixture resets are relative to it.
const NOW = Math.floor(Date.now() / 1000) * 1000;
const RESETS_AT = NOW / 1000 + 3600;
const FABLE_RESETS_AT = NOW / 1000 + 600;

const PROFILE = (() => {
  const starter = buildStarterProfile("starter-balanced");
  return { ...starter, signals: { ...starter.signals, classifier: true, providerSwitch: false } };
})();

const AVAILABILITY: Record<ProviderId, boolean> = {
  "claude-code": true, codex: true, cursor: false, kiro: false, opencode: false,
};

/** Fable's own weekly window is used up; the account has plenty of room. */
function fableExhausted(fableWeekly: number | null = 100): RateLimitsSnapshotResponse {
  const snapshot = emptyRateLimitsSnapshot();
  snapshot.claude = {
    source: "oauth",
    session: { usedPercent: 10, resetsAt: RESETS_AT },
    weekly: { usedPercent: 20, resetsAt: RESETS_AT },
    fableWeekly: fableWeekly == null ? null : { usedPercent: fableWeekly, resetsAt: FABLE_RESETS_AT },
    error: null,
  };
  snapshot.codex = {
    source: "rpc", error: null,
    buckets: [{ limitId: "codex", limitName: null, planType: null,
      primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: RESETS_AT },
      secondary: null, individualLimit: null, credits: null }],
  } as RateLimitsSnapshotResponse["codex"];
  return snapshot;
}

describe("Claude's Fable weekly window binds Fable only", () => {
  test("account-wide reads leave the Fable window out; schedule reads keep its reset", () => {
    const snapshot = fableExhausted();
    expect(resolveTightestAccountUsageWindow({ providerId: "claude-code", snapshot })?.usedPercent).toBe(20);
    expect(resolveTightestAccountUsageWindow({ providerId: "claude-code", scope: "all", snapshot })?.usedPercent).toBe(100);
    // The meter's next read still lands on Fable's reset, so its ring refreshes.
    expect(resolveEarliestAccountUsageResetAtMs({ providerId: "claude-code", snapshot })).toBe(FABLE_RESETS_AT * 1000);
  });

  test("the status-bar dot follows the account windows; the Fable ring says it holds Fable turns", () => {
    const windows = buildUsageHeadlineWindows({ provider: "claude", claude: fableExhausted().claude });
    expect(windows.map((window) => window.usedPercent)).toEqual([10, 20, 100]);
    expect(headlineUsagePercent(windows)).toBe(20);
    const fable = windows.find((window) => window.scopedModel === "Fable")!;
    const hint = describeUsageWindow({ window: fable, providerName: "Claude", blockAtLimit: true, now: NOW });
    expect(hint.lines.join(" ")).toContain("Claude Fable turns");
    const session = describeUsageWindow({ window: windows[0]!, providerName: "Claude", blockAtLimit: true, now: NOW });
    expect(session.lines.join(" ")).not.toContain("Fable");
    // Only a scoped window reported: it is all the dot has.
    expect(headlineUsagePercent([fable])).toBe(100);
  });

  test("a task's account headroom uses its own model's windows", () => {
    const message = (model: string) => ({
      id: model, role: "assistant", providerId: "claude-code", model, content: "", parts: [],
    }) as unknown as ChatMessage;
    const summarize = (messages: ChatMessage[]) => buildTaskExecutionSummary({
      providerId: "claude-code", messages, rateLimits: fableExhausted(), now: NOW,
    }).accountLimit.value;
    expect(summarize([message("claude-opus-5-5")])?.usedPercent).toBe(20);
    expect(summarize([])?.usedPercent).toBe(20);
    expect(summarize([message("claude-fable-5-2")])).toMatchObject({ usedPercent: 100, label: "Model weekly" });
  });

  test("a Fable-only reading still names the used-up model for the team", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: null, weekly: null,
      fableWeekly: { usedPercent: 100, resetsAt: FABLE_RESETS_AT }, error: null };
    const summary = summarizeProviderUsage({
      providerId: "claude-code", now: NOW,
      observation: { snapshot, metadata: { observedAt: new Date(NOW).toISOString() } },
    });
    expect(summary.status).toBe("unknown");
    expect(summary.exhaustedModels).toContain("claude-fable-5-2");
  });
});

describe("Claude /usage text keeps model rows out of the account weekly slot", () => {
  test("Fable variants go to the Fable slot and other model rows are skipped", () => {
    const parsed = parseClaudeUsageReportText([
      "Current week (Sonnet only): 77% used · resets in 2d",
      "Current week (Claude Fable): 55% used · resets in 2d",
      "Current week (all models): 10% used · resets in 2d",
    ].join("\n"));
    expect(parsed.weekly?.usedPercent).toBe(10);
    expect(parsed.fableWeekly?.usedPercent).toBe(55);
  });

  test("an unscoped weekly row is still the account weekly window", () => {
    expect(parseClaudeUsageReportText("Weekly usage: 40% used · resets in 3d").weekly?.usedPercent).toBe(40);
  });
});

describe("Auto routing around a used-up model", () => {
  const signalsFor = (snapshot: RateLimitsSnapshotResponse, complexity: "medium" | "extreme") =>
    computeRouterSignals({
      prompt: "refactor the payment module", fileContextCount: 0, history: [],
      currentProviderId: "claude-code", currentModel: "claude-opus-5-5", profile: PROFILE,
      rateLimitsSnapshot: snapshot, providerAvailability: AVAILABILITY,
      classifier: { version: 2, intent: "implement", complexity, risk: "normal", continuity: "new", evidenceCodes: [] },
    }).signals;

  test("Fable's window lowers neither the Claude budget nor Standard work's model", () => {
    const signals = signalsFor(fableExhausted(), "medium");
    expect(signals.budgetUsedPercent).toBe(20);
    expect(signals.exhaustedModelsByProvider?.["claude-code"]).toContain("claude-fable-5-2");
    const route = resolveRoute({ profile: PROFILE, role: "primary", signals, now: NOW });
    expect(route).toMatchObject({ providerId: "claude-code" });
    expect(route.model).not.toContain("sonnet");
  });

  test("Extreme work skips the used-up Fable for a capable model elsewhere", () => {
    const route = resolveRoute({ profile: PROFILE, role: "primary", signals: signalsFor(fableExhausted(), "extreme"), now: NOW });
    expect(route.model).not.toContain("fable");
    expect(resolveRouteTierForModel(route.model)).toBe("frontier");
    // With Fable available, Extreme stays on Claude's frontier model.
    const fresh = resolveRoute({ profile: PROFILE, role: "primary", signals: signalsFor(fableExhausted(30), "extreme"), now: NOW });
    expect(fresh.model).toContain("fable");
  });

  test("when every capable model is used up, Auto still routes for the guard to report", () => {
    const signals = signalsFor(fableExhausted(), "extreme");
    const route = resolveRoute({
      profile: PROFILE, role: "primary", now: NOW,
      signals: { ...signals, providerAvailability: { ...AVAILABILITY, codex: false } },
    });
    expect(route.model).toContain("fable");
  });

  test("a provider whose every model is blocked is left to availability, not the model filter", () => {
    const snapshot = fableExhausted();
    snapshot.claude.weekly!.usedPercent = 100;
    expect(resolveExhaustedRouteModels({ profile: PROFILE, rateLimitsSnapshot: snapshot })["claude-code"]).toBeUndefined();
  });
});
