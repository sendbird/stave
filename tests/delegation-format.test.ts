import { describe, expect, test } from "bun:test";
import {
  describeAgentIdentity,
  describeDeadline,
  describeExchangeStatus,
  exchangeStatusFromDelegatedTaskPhase,
  exchangeStatusFromToolState,
  exchangeStatusFromWorkGraphStatus,
  formatEffortLabel,
} from "@/lib/delegation/format";
import { formatDuration } from "@/i18n/format";
import { formatTurnActivityElapsedSeconds } from "@/components/session/turn-activity.utils";

describe("delegation durations", () => {
  test("read in the shared words, with tenths under ten seconds", () => {
    // Floors like every live clock: 150ms is 0.1s, 59.9s is 59s.
    expect(formatDuration(150, { tenths: true })).toBe("0.1s");
    expect(formatDuration(2_400, { tenths: true })).toBe("2.4s");
    expect(formatDuration(64_000, { tenths: true })).toBe("1m 4s");
    expect(formatDuration(3_720_000, { tenths: true })).toBe("1h 2m");
  });

  test("the turn-activity formatter reads the same span the same way", () => {
    expect(formatTurnActivityElapsedSeconds(64)).toBe("1m 4s");
    expect(formatTurnActivityElapsedSeconds(4)).toBe("4s");
    expect(formatTurnActivityElapsedSeconds(3_720)).toBe("1h 2m");
  });
});

describe("describeDeadline", () => {
  const nowMs = 1_000_000;

  test("counts down against an absolute deadline", () => {
    expect(describeDeadline({ deadlineAtMs: nowMs + 12_000, nowMs })).toEqual({
      label: "Deadline in 12s",
      passed: false,
      remainingMs: 12_000,
    });
  });

  test("accepts a remaining span", () => {
    expect(describeDeadline({ remainingMs: 400, nowMs }).label).toBe(
      "Deadline in 0.4s",
    );
  });

  test("a passed deadline says so instead of counting zero", () => {
    const passed = describeDeadline({ deadlineAtMs: nowMs - 1, nowMs });
    expect(passed.label).toBe("Deadline passed");
    expect(passed.passed).toBe(true);
    expect(passed.remainingMs).toBe(0);
    expect(describeDeadline({ deadlineAtMs: nowMs, nowMs }).passed).toBe(true);
  });

  test("no deadline is a state, not an error", () => {
    expect(describeDeadline({ nowMs })).toEqual({
      label: "No deadline",
      passed: false,
      remainingMs: null,
    });
  });
});

describe("describeAgentIdentity", () => {
  test("prints the catalog model name and title-case effort; the provider leads only without a model", () => {
    const identity = describeAgentIdentity({
      providerId: "claude-code",
      model: "claude-opus-5",
      effort: "high",
      role: "Advisor",
    });
    expect(identity.providerLabel).toBe("Claude");
    expect(identity.modelLabel).toBe("Claude Opus 5");
    expect(identity.effortLabel).toBe("High");
    expect(identity.roleLabel).toBe("Advisor");
    expect(identity.text).toBe("Claude Opus 5 · High");
  });

  test("omits segments the runtime never reported", () => {
    expect(describeAgentIdentity({ providerId: "codex" }).text).toBe("Codex");
    expect(describeAgentIdentity({}).text).toBe("Not resolved");
    expect(describeAgentIdentity({ effort: "xhigh" }).effortLabel).toBe(
      "X-High",
    );
  });

  test("never leaks a raw model id", () => {
    expect(describeAgentIdentity({ model: "gpt-5.6-sol" }).text).toBe(
      "GPT-5.6 Sol",
    );
    expect(formatEffortLabel("ultra")).toBe("Ultra");
    expect(formatEffortLabel("custom")).toBe("Custom");
  });
});

describe("exchange status vocabulary", () => {
  test("every status has a label, tone and settled flag", () => {
    expect(describeExchangeStatus("returned")).toEqual({
      label: "Returned",
      tone: "success",
      settled: true,
    });
    expect(describeExchangeStatus("running").settled).toBe(false);
    expect(describeExchangeStatus("timed_out").label).toBe("Timed out");
  });

  test("adapts transcript tool states", () => {
    expect(exchangeStatusFromToolState("output-available")).toBe("returned");
    expect(exchangeStatusFromToolState("output-error")).toBe("failed");
    expect(exchangeStatusFromToolState("input-streaming")).toBe("queued");
    expect(exchangeStatusFromToolState("input-available")).toBe("running");
  });

  test("adapts delegated-task phases and graph statuses", () => {
    expect(exchangeStatusFromDelegatedTaskPhase("waiting")).toBe("running");
    expect(exchangeStatusFromDelegatedTaskPhase("interrupted")).toBe("failed");
    expect(exchangeStatusFromDelegatedTaskPhase("cancelled")).toBe("cancelled");
    expect(exchangeStatusFromWorkGraphStatus("completed")).toBe("returned");
    expect(exchangeStatusFromWorkGraphStatus("cancelled")).toBe("cancelled");
  });
});
