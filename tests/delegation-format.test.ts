import { describe, expect, test } from "bun:test";
import {
  describeAgentIdentity,
  describeDeadline,
  describeExchangeStatus,
  exchangeStatusFromAdvisorOutcome,
  exchangeStatusFromChildTaskPhase,
  exchangeStatusFromToolState,
  exchangeStatusFromWorkGraphStatus,
  formatEffortLabel,
  formatExchangeDuration,
} from "@/lib/delegation/format";
import { formatAdvisorDuration } from "@/lib/providers/advisor-activity";
import { formatTurnActivityElapsedSeconds } from "@/components/session/turn-activity.utils";
import { describeAdvisorParticipant } from "@/components/session/advisor-exchange.utils";
import { describeDelegationPlan } from "@/components/collaboration/DelegateTaskForm";
import { createEmptyDelegationDraft } from "@/lib/collaboration/delegation-draft";

describe("formatExchangeDuration", () => {
  test("uses one scale from sub-second to hours", () => {
    expect(formatExchangeDuration(0)).toBe("0s");
    expect(formatExchangeDuration(150)).toBe("0.2s");
    expect(formatExchangeDuration(400)).toBe("0.4s");
    expect(formatExchangeDuration(2_400)).toBe("2.4s");
    expect(formatExchangeDuration(4_000)).toBe("4s");
    expect(formatExchangeDuration(12_000)).toBe("12s");
    expect(formatExchangeDuration(64_000)).toBe("1m 4s");
    expect(formatExchangeDuration(120_000)).toBe("2m");
    expect(formatExchangeDuration(3_720_000)).toBe("1h 2m");
  });

  test("negative or non-finite input reads as zero", () => {
    expect(formatExchangeDuration(-500)).toBe("0s");
  });

  test("the advisor and turn-activity formatters share the implementation", () => {
    expect(formatAdvisorDuration(2_400)).toBe(formatExchangeDuration(2_400));
    expect(formatAdvisorDuration(64_000)).toBe("1m 4s");
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

  test("the advisor participant line goes through the same vocabulary", () => {
    expect(
      describeAdvisorParticipant({
        providerId: "codex",
        model: "gpt-5.6-sol",
      }),
    ).toBe("GPT-5.6 Sol");
    expect(describeAdvisorParticipant({})).toBe("Not resolved");
  });

  test("the delegation plan names the provider from the catalog", () => {
    const draft = { ...createEmptyDelegationDraft(), providerId: "codex" as const };
    expect(describeDelegationPlan(draft).startsWith("Codex · ")).toBe(true);
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

  test("adapts advisor outcomes", () => {
    expect(exchangeStatusFromAdvisorOutcome("pending")).toBe("running");
    expect(exchangeStatusFromAdvisorOutcome("completed")).toBe("returned");
    expect(exchangeStatusFromAdvisorOutcome("timeout")).toBe("timed_out");
    expect(exchangeStatusFromAdvisorOutcome("skipped")).toBe("cancelled");
    expect(exchangeStatusFromAdvisorOutcome("aborted")).toBe("cancelled");
    expect(exchangeStatusFromAdvisorOutcome("armed")).toBe("queued");
    expect(exchangeStatusFromAdvisorOutcome("unresolved")).toBe("unresolved");
  });

  test("adapts transcript tool states", () => {
    expect(exchangeStatusFromToolState("output-available")).toBe("returned");
    expect(exchangeStatusFromToolState("output-error")).toBe("failed");
    expect(exchangeStatusFromToolState("input-streaming")).toBe("queued");
    expect(exchangeStatusFromToolState("input-available")).toBe("running");
  });

  test("adapts child-task phases and graph statuses", () => {
    expect(exchangeStatusFromChildTaskPhase("waiting")).toBe("running");
    expect(exchangeStatusFromChildTaskPhase("interrupted")).toBe("failed");
    expect(exchangeStatusFromChildTaskPhase("cancelled")).toBe("cancelled");
    expect(exchangeStatusFromWorkGraphStatus("completed")).toBe("returned");
    expect(exchangeStatusFromWorkGraphStatus("cancelled")).toBe("cancelled");
  });
});
