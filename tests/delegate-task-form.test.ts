import { describe, expect, test } from "bun:test";
import {
  applyRoutedDelegateDefaults,
  describeDelegateAssignee,
  describeDelegationPlan,
  type RoutedDelegateDefaults,
} from "@/components/collaboration/DelegateTaskForm";
import { createEmptyDelegationDraft } from "@/lib/collaboration/delegation-draft";

const routed: RoutedDelegateDefaults = {
  model: "gpt-5.6-sol",
  effort: "medium",
  reason: "Delegate role: balanced strength for bounded work.",
};

describe("describeDelegationPlan", () => {
  test("names only the model when one is chosen; the provider is implied", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
      model: "gpt-5.6-sol",
      effort: "high" as const,
    };
    expect(describeDelegationPlan(draft, routed)).toBe(
      "GPT-5.6 Sol · High effort · Guided · Separate worktree",
    );
  });

  test("shows the routed model as Auto without the provider label", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
    };
    expect(describeDelegationPlan(draft, routed)).toBe(
      "Auto → GPT-5.6 Sol · Medium effort (Auto) · Guided · Separate worktree",
    );
  });

  test("keeps the provider label when only a default model can be named", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "claude-code" as const,
      isolated: false,
    };
    expect(describeDelegationPlan(draft, null)).toBe(
      "Claude · Default model · Default effort · Guided · Shares your files",
    );
  });
});

describe("describeDelegateAssignee", () => {
  test("summarises the routed default with its reason", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
    };
    expect(describeDelegateAssignee(draft, routed)).toEqual({
      providerId: "codex",
      model: "gpt-5.6-sol",
      effort: "medium",
      source: "auto",
      reason: routed.reason,
    });
  });

  test("a chosen effort rides along with the routed model", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
      effort: "xhigh" as const,
    };
    const assignee = describeDelegateAssignee(draft, routed);
    expect(assignee.source).toBe("auto");
    expect(assignee.effort).toBe("xhigh");
  });

  test("a chosen model reads as the user's pick", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
      model: " gpt-6-astra ",
    };
    expect(describeDelegateAssignee(draft, routed)).toEqual({
      providerId: "codex",
      model: "gpt-6-astra",
      source: "explicit",
      reason: "Chosen by you",
    });
  });

  test("falls back to the provider default when nothing is routed", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "claude-code" as const,
    };
    const assignee = describeDelegateAssignee(draft, null);
    expect(assignee.source).toBe("provider-default");
    expect(assignee.model).toBe("");
    expect(assignee.reason).toBe("Claude picks its default model.");
  });

  test("the summary and the request agree on what gets sent", () => {
    const draft = {
      ...createEmptyDelegationDraft(),
      providerId: "codex" as const,
    };
    const sent = applyRoutedDelegateDefaults(draft, routed);
    const shown = describeDelegateAssignee(draft, routed);
    expect(sent.model).toBe(shown.model);
    expect(sent.effort).toBe(shown.effort);
  });
});
