import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdvisorConsultLogDialog } from "@/components/session/AdvisorConsultLogDialog";
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import type { AdvisorConsultLogEntry } from "@/lib/providers/advisor-consult-log";
import type { ProviderTurnWorkItem } from "@/lib/providers/turn-status";

const T0 = 1_700_000_000_000;

function snapshot(
  overrides: Partial<AdvisorExchangeSnapshot> = {},
): AdvisorExchangeSnapshot {
  return {
    turnId: "turn-1",
    exchangeId: "exchange-1",
    consultIndex: 1,
    consultLimit: 5,
    question: "Is the cancellation path sound?",
    primaryProviderId: "claude-code",
    primaryModel: "claude-opus-4-6",
    advisorProviderId: "codex",
    advisorModel: "gpt-5.6-sol",
    isolation: "codex-ephemeral-read-only",
    startedAt: T0,
    timeoutMs: 90_000,
    outcome: "completed",
    outcomeAt: T0 + 4_000,
    durationMs: 4_000,
    advice: "Cancel the preflight before the primary aborts.",
    adviceChars: 45,
    inputTokens: 900,
    outputTokens: 120,
    settledConsults: 1,
    stages: [
      { phase: "started", at: T0 },
      { phase: "completed", at: T0 + 4_000 },
    ],
    ...overrides,
  };
}

function entry(
  key: string,
  overrides: Partial<AdvisorExchangeSnapshot> = {},
  verdict?: AdvisorConsultLogEntry["verdict"],
): AdvisorConsultLogEntry {
  return {
    key,
    snapshot: snapshot(overrides),
    updatedAt: T0,
    ...(verdict ? { verdict } : {}),
  };
}

function workItem(
  id: string,
  startedAt: number,
  title: string,
): ProviderTurnWorkItem {
  return {
    id,
    kind: "tool",
    status: "completed",
    title,
    progressMessages: [],
    startedAt,
    updatedAt: startedAt,
  };
}

function render(
  props: Partial<Parameters<typeof AdvisorConsultLogDialog>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(AdvisorConsultLogDialog, {
      open: true,
      onOpenChange: () => {},
      entries: [entry("turn-1::exchange-1")],
      selectedKey: "turn-1::exchange-1",
      onSelectEntry: () => {},
      activeTurnId: "turn-1",
      workItems: [],
      tallyByModel: {},
      onSetVerdict: () => {},
      ...props,
    }),
  );
}

describe("AdvisorConsultLogDialog", () => {
  test("renders one row per archived consult", () => {
    const html = render({
      entries: [
        entry("turn-1::exchange-2", {
          exchangeId: "exchange-2",
          consultIndex: 2,
          question: "Does the retry path double-count?",
        }),
        entry("turn-1::exchange-1"),
      ],
    });

    expect(html).toContain("Consult 1/5");
    expect(html).toContain("Consult 2/5");
    expect(
      html.match(/data-testid="advisor-consult-log-row"/g) ?? [],
    ).toHaveLength(2);
  });

  test("renders the selected consult's question and advice in full", () => {
    const html = render();

    expect(html).toContain("Is the cancellation path sound?");
    expect(html).toContain("Cancel the preflight before the primary aborts.");
    expect(html).toContain("Did the advisor system work?");
  });

  test("states that the question was never reported rather than hiding it", () => {
    const html = render({
      entries: [entry("turn-1::exchange-1", { question: undefined })],
    });

    expect(html).toContain("The runtime did not report the question.");
  });

  test("never implies the spend is a share of the turn", () => {
    // Load-bearing: ChatMessage.usage is per message and carries no turn id, so
    // a percentage denominator would silently drift as messages page in and
    // out. Asserted verbatim because dropping it turns an absolute number into
    // an implied one.
    const html = render();

    expect(html).toContain(
      "Reported by the runtime for the advisor call only. Stave reports usage per message, not per turn, so this is not a share of the turn&#x27;s total.",
    );
    expect(html).toContain("900 in · 120 out");
  });

  test("never implies the consult caused what ran after it", () => {
    // Load-bearing: advice returns as a tool result the primary may ignore, so
    // this section is sequence, not causality, and must say so.
    const html = render({
      workItems: [
        workItem("before", T0 + 1_000, "Read src/before.ts"),
        workItem("after", T0 + 9_000, "Edit src/after.ts"),
      ],
    });

    expect(html).toContain(
      "Tool calls in this turn that started after the consult settled, in order. Sequence only — Stave cannot tell whether the advice caused them.",
    );
    expect(html).toContain("Edit src/after.ts");
    expect(html).not.toContain("Read src/before.ts");
  });

  test("says why nothing ran after when the work items are gone", () => {
    const html = render({ workItems: [] });

    expect(html).toContain(
      "No tool calls from this turn are still in memory, so Stave cannot say what ran after.",
    );
  });

  test("offers the verdict options and marks the recorded one", () => {
    const html = render({
      entries: [entry("turn-1::exchange-1", {}, "not_helpful")],
    });

    expect(html).toContain(
      "Your own judgement, recorded per consult. Stave does not infer this.",
    );
    expect(html).toContain("Was this consult helpful?");
    expect(html).toContain("Helpful");
    expect(html).toContain("Not helpful");
    expect(html).toContain("Ignored");
    expect(html).toContain('aria-checked="true"');
  });

  test("reports the advisor's running record without a denominator", () => {
    // No "4 of 9": the tally outlives ring eviction, so a denominator drifts.
    const rated = render({
      entries: [entry("turn-1::exchange-1", {}, "helpful")],
      tallyByModel: {
        "codex:gpt-5.6-sol": {
          providerId: "codex",
          model: "gpt-5.6-sol",
          helpful: 3,
          notHelpful: 1,
          ignored: 0,
        },
      },
    });
    expect(rated).toContain("3 helpful · 1 not helpful this session.");

    expect(render()).toContain("No verdicts recorded for this advisor yet.");
  });

  test("an unsettled consult of a finished turn reads as unresolved", () => {
    const html = render({
      entries: [
        entry("turn-1::exchange-1", {
          outcome: "pending",
          outcomeAt: undefined,
          durationMs: undefined,
          advice: undefined,
          stages: [{ phase: "started", at: T0 }],
        }),
      ],
      activeTurnId: "turn-2",
      workItems: [workItem("after", T0 + 9_000, "Edit src/after.ts")],
    });

    expect(html).toContain("Unresolved");
    // The checks read off `outcome`, which is still `pending`, so the detail
    // pane has to say why rather than claiming the advisor is being waited on.
    expect(html).toContain(
      "Its turn ended before the runtime reported an outcome, so this consult has no result and no cost to show.",
    );
    // Neither section is honest about a consult that never settled.
    expect(html).not.toContain("What ran after this consult");
    expect(html).not.toContain("Was this consult helpful?");
  });
});
