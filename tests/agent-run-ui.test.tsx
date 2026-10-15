import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { AgentRunResultCardView } from "../src/components/agent-runs/AgentRunResultCard";
import { AgentRunBarView } from "../src/components/agent-runs/AgentRunBar";
import { AgentRunDetailView } from "../src/components/agent-runs/AgentRunPanel";
import { StageDividerView } from "../src/components/agent-runs/StageDivider";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { selectAgentRunCard } from "../src/lib/agent-runs/agent-run-status";
import { AGENT_RUN_NOW, agentRunDetail, agentRunFixture, patchCurrent } from "./fixtures/agent-run-fixtures";
import { applyRuntimeLocale } from "@/i18n/runtime";
import {
  filterRunAccountPoolAccounts,
  offersRunPoolAccount,
  PromptInputRunAccountPoolAccounts,
  PromptInputRunAccountPoolSection,
  RUN_ACCOUNT_POOL_SEARCH_MIN_ACCOUNTS,
  type PromptInputRunAccountPool,
} from "../src/components/ai-elements/prompt-input-run-account-pool";

const START = new Date("2026-10-01T09:00:00.000Z");
const NOW = START.getTime() + 4 * 60_000;
const runs = buildAgentRunFixtures(START);
const noop = (async () => ({ ok: true, agentRun: null })) as never;

const bar = (detail: AgentRunDetail, nowPhrase: string | null = null) =>
  renderToStaticMarkup(
    createElement(AgentRunBarView, {
      detail,
      nowPhrase,
      now: NOW,
      reducedMotion: false,
      agentActions: { onResume: () => {}, onStop: () => {}, onTakeControl: () => {}, onRetry: () => {} },
      actions: { onOpenPanel: () => {} },
    }),
  );
const panel = (detail: AgentRunDetail) =>
  renderToStaticMarkup(
    createElement(AgentRunDetailView, { detail, now: NOW, onCommand: noop, agentActions: { onStop: () => {}, onTakeControl: () => {}, onRetry: () => {}, onOpenPullRequest: () => {} } }),
  );
const card = (detail: AgentRunDetail, now = NOW) =>
  renderToStaticMarkup(
    createElement(AgentRunResultCardView, {
      detail,
      now,
      actions: { onOpenPullRequest: () => {}, onRetry: () => {}, onTakeControl: () => {} },
    }),
  );

describe("agent run status line", () => {
  test("says Running and how long, with Stop and Take control, and no stage track", () => {
    const html = bar(runs.working, "Running the tests");
    expect(html).toContain('data-testid="agent-run-bar"');
    expect(html).toContain("Running");
    expect(html).toContain("Running the tests");
    expect(html).not.toContain("Planning…");
    expect(html).toContain("4m");
    expect(html).toContain("Stop");
    expect(html).toContain("Take control");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("Stage ");
  });

  test("an agent with a workflow shows its stages and where it stands", () => {
    const html = bar(runs.workflow);
    expect(html).toContain("<ol");
    expect(html).toContain("2/3");
    expect(html).toContain("Cause");
    const detail = panel(runs.workflow);
    expect(detail).toContain('aria-label="Stages"');
    expect(detail).toContain("Reproduce");
    expect(detail).toContain("Check in: Only when stuck");
    expect(panel(runs.working)).not.toContain('aria-label="Stages"');
  });

  test("a blocked run says Halted · Blocked and what it waits on", () => {
    const html = bar(runs.blocked);
    expect(html).toContain("Halted · Blocked");
    expect(html).toContain("Which breakpoint should the table switch at");
    expect(html).not.toContain("Retry");
  });

  test("a stuck run's bar owns its reason and Retry while the run is active", () => {
    const html = bar(runs.stuck);
    expect(html).toContain("Halted · Blocked");
    expect(html).toContain("The tests have been pending for 20 minutes.");
    expect(html).toContain("Retry");
    expect(html).toContain("Stop");
    expect(html).toContain("Take control");
    expect(bar(runs.working)).not.toContain("Retry");
  });

  test("a legacy run keeps its stage track and Take over", () => {
    const aggregate = agentRunFixture();
    const html = renderToStaticMarkup(
      createElement(AgentRunBarView, {
        detail: agentRunDetail(aggregate),
        nowPhrase: null,
        now: AGENT_RUN_NOW.getTime() + 60_000,
        reducedMotion: false,
        actions: { onTakeOver: () => {} },
      }),
    );
    expect(html).toContain('data-testid="agent-run-bar"');
    expect(html).toContain("<ol");
    expect(html).toContain("Take over");
    expect(html).not.toContain("Take control");
  });
});

describe("agent run result card", () => {
  test("a ready run closes the conversation with its result", () => {
    const html = card(runs.ready);
    expect(html).toContain('data-testid="agent-run-result"');
    expect(html).toContain("Completed");
    expect(html).toContain("Implementer · 23m");
    expect(html).toContain("Checked by Stave");
    expect(html).toContain("Met · agent reported");
    expect(html).toContain("Not verified");
    expect(html).toContain("7 files");
    expect(html).toContain("PR #612");
    expect(html).toContain("scroll container");
    expect(html).not.toContain("Ask for changes");
    expect(html).toContain("Open PR");
  });

  test("Open PR appears only when the run names a pull request", () => {
    const withoutPullRequest: AgentRunDetail = {
      ...runs.ready,
      report: null,
      stages: runs.ready.stages.map((stage) =>
        stage.report?.outcome === "complete" ? { ...stage, report: { ...stage.report, artifacts: [] } } : stage,
      ),
    };
    const html = card(withoutPullRequest);
    expect(html).not.toContain("Ask for changes");
    expect(html).not.toContain("Open PR");
  });

  test("a run Stave stopped gives the reason with Retry and Take control", () => {
    const html = card(runs.failed);
    expect(html).toContain('data-testid="agent-run-reason"');
    expect(html).toContain("Stopped");
    expect(html).toContain("The run used all 30 turns before it finished.");
    expect(html).toContain("Retry");
    expect(html).toContain("Take control");
    expect(html).not.toContain("Ask for changes");
  });

  test("an active run leaves no card, stuck included: the bar owns it", () => {
    expect(card(runs.stuck)).toBe("");
    expect(card(runs.working)).toBe("");
    expect(card(runs.blocked)).toBe("");
    expect(card(runs.stopped)).toBe("");
  });

  test("a message that started after the run ended makes the card history", () => {
    const later = new Date(Date.parse(runs.failed.agentRun.updatedAt) + 60_000).toISOString();
    expect(selectAgentRunCard({ detail: runs.failed })).toBe("reason");
    expect(selectAgentRunCard({ detail: runs.ready, lastMessageStartedAt: runs.ready.agentRun.createdAt })).toBe("result");
    expect(selectAgentRunCard({ detail: runs.failed, lastMessageStartedAt: later })).toBeNull();
    expect(selectAgentRunCard({ detail: agentRunDetail(agentRunFixture()) })).toBeNull();
  });
});

describe("agent run in the Progress tab", () => {
  test("shows the agent and state, Done when and the result, without workflow controls", () => {
    const html = panel(runs.ready);
    expect(html).toContain('data-testid="agent-run-panel"');
    expect(html).toContain("Implementer");
    expect(html).toContain("Completed");
    expect(html).toContain("Done when");
    expect(html).toContain("Checked by Stave");
    expect(html).toContain("Run report");
    expect(html).toContain("Run figures");
    expect(html).not.toContain("Ask for changes");
    expect(html).not.toContain("Stages");
    expect(html).not.toContain("Save as workflow");
    expect(html).not.toContain("Stop run");
    expect(html).not.toContain("Pause");
  });

  test("keeps the state and the reason, and leaves Stop, Take control and Retry to the bar and the card", () => {
    const working = panel(runs.working);
    expect(working).toContain("Running");
    const stuck = panel(runs.stuck);
    expect(stuck).toContain("Halted");
    expect(stuck).toContain("The tests have been pending for 20 minutes.");
    const failed = panel(runs.failed);
    expect(failed).toContain("Stopped");
    expect(failed).toContain("The run used all 30 turns before it finished.");
    for (const html of [working, stuck, failed]) {
      expect(html).not.toContain(">Stop<");
      expect(html).not.toContain("Take control");
      expect(html).not.toContain("Retry");
    }
  });

  test("a one-stage run lists the agent's plan as its steps", () => {
    const plan = {
      turnId: "turn-2",
      items: [
        { content: "Reproduce on a narrow screen", status: "completed" as const },
        { content: "Fix the table", status: "in_progress" as const },
      ],
    };
    const detail: AgentRunDetail = {
      ...runs.working,
      stages: runs.working.stages.map((record) => ({ ...record, facts: { diff: null, commands: [], toolCalls: [], action: null, plan } })),
    };
    const html = panel(detail);
    expect(html).toContain('aria-label="Plan"');
    expect(html).toContain("1 of 2 done");
    expect(html).toContain("Reproduce on a narrow screen");
    expect(html).toContain("Fix the table");
    // No plan written yet: no empty section.
    expect(panel(runs.working)).not.toContain('aria-label="Plan"');
  });

  test("a run with a workflow names it and lets you retry or skip a stuck stage", () => {
    const titles = runs.workflow.agentRun.workflow.stages.map((stage) => stage.title).join(" → ");
    const running = panel(runs.workflow);
    expect(running).toContain(`Workflow: ${titles}`);
    expect(running).toContain("Stages");
    expect(running).not.toContain("Retry stage");
    const stuck: AgentRunDetail = {
      ...runs.workflow,
      stages: runs.workflow.stages.map((record) =>
        record.stageId === "cause" ? { ...record, status: "stuck", detail: "No progress for 20 minutes." } : record,
      ),
    };
    const html = panel(stuck);
    expect(html).toContain("Retry stage");
    expect(html).toContain("Skip");
  });

  test("a legacy run keeps its stage list", () => {
    const html = renderToStaticMarkup(
      createElement(AgentRunDetailView, { detail: agentRunDetail(agentRunFixture()), now: AGENT_RUN_NOW.getTime() + 60_000, onCommand: noop }),
    );
    expect(html).toContain('data-testid="agent-run-panel"');
    expect(html).toContain("Stages");
    expect(html).toContain("Run ·");
  });
});

describe("stage divider", () => {
  test("a workflow stage keeps its divider", () => {
    expect(renderToStaticMarkup(createElement(StageDividerView, { text: "Stage 3 · Verify — started automatically" }))).toContain(
      'data-testid="agent-run-stage-divider"',
    );
  });
});

test("action failures expose Retry even for a single-stage agent", () => {
  const aggregate = patchCurrent(agentRunFixture(), { status: "blocked", blockReason: "action-failed", detail: "Fix the script then retry." });
  aggregate.agentRun.origin = "agent";
  aggregate.agentRun.workflow.stages = [{ id: aggregate.stages[0]!.stageId, title: "Check", kind: "action", action: { type: "run-script", scriptId: "check" } }];
  const detail = agentRunDetail(aggregate);
  expect(bar(detail)).toContain(">Retry<");
});


test("the run line and panel show usage waiting and a manual resume, without a stuck recovery", () => {
  const html = bar(runs.waiting);
  expect(html).toContain("Waiting for usage reset");
  expect(html).toContain("Resume now");
  expect(html).not.toContain("Halted");
  expect(html).not.toContain("Retry");
  expect(panel(runs.waiting)).toContain("Waiting for usage reset at");
  expect(card(runs.waiting)).toBe("");
});

describe("Run start option: account pool", () => {
  const pool = (patch: Partial<PromptInputRunAccountPool> = {}): PromptInputRunAccountPool => ({
    providerId: "claude-code", enabled: false, locked: false,
    accounts: [
      { id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", label: "Work", current: true, included: true },
      { id: "system-default", label: "System default", current: false, included: true },
      { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", label: "Personal", current: false, included: false },
    ],
    onEnabledChange: () => {}, onAccountIncludedChange: () => {}, ...patch,
  });
  const render = (value: PromptInputRunAccountPool) => renderToStaticMarkup(createElement(PromptInputRunAccountPoolSection, { pool: value }));

  test("off by default: the option and the terms notice, no account list", () => {
    const html = render(pool());
    expect(html).toContain("Continue on my other accounts at a usage limit");
    expect(html).toContain("API connections are never used.");
    expect(html).toContain("Automatic account switching may be limited by each provider&#x27;s terms.");
    expect(html).not.toContain("Accounts in the pool");
  });

  test("on: the run's account first and fixed, then the others to include or leave out", () => {
    const html = render(pool({ enabled: true }));
    expect(html).toContain("Accounts in the pool");
    expect(html.indexOf("Work")).toBeLessThan(html.indexOf("System default"));
    expect(html.indexOf("System default")).toBeLessThan(html.indexOf("Personal"));
    expect(html).toContain("Current account");
  });

  test("the notice reads in Korean", () => {
    try {
      applyRuntimeLocale("ko");
      expect(render(pool())).toContain("계정 자동 전환은 각 제공사 약관 해석에 따라 제한될 수 있습니다.");
    } finally {
      applyRuntimeLocale("en");
    }
  });

  test("an account whose sign-in check is not a confirmed sign-in is not offered; the run's own account always is", () => {
    const signedIn = { state: "signed-in" as const, email: null, plan: null, checkedAt: 1 };
    const signedOut = { state: "signed-out" as const, checkedAt: 1 };
    const failed = { state: "unknown" as const, reason: "failed" as const, checkedAt: 1 };
    const row = { locked: false, current: false };
    expect(offersRunPoolAccount({ ...row, identity: signedIn })).toBe(true);
    expect(offersRunPoolAccount({ ...row, identity: signedOut })).toBe(false);
    expect(offersRunPoolAccount({ ...row, identity: failed })).toBe(false);
    // Still being checked: shown until the answer arrives (the send checks again).
    expect(offersRunPoolAccount({ ...row, identity: undefined })).toBe(true);
    expect(offersRunPoolAccount({ ...row, current: true, identity: signedOut })).toBe(true);
    expect(offersRunPoolAccount({ ...row, locked: true, identity: failed })).toBe(true);
  });

  test("a short list scrolls within its cap and has no search field", () => {
    const html = render(pool({ enabled: true }));
    expect(html).toContain('data-testid="run-account-pool-list"');
    expect(html).not.toContain('data-testid="run-account-pool-search"');
  });

  describe("a long list", () => {
    const many = Array.from({ length: RUN_ACCOUNT_POOL_SEARCH_MIN_ACCOUNTS }, (_, index) => ({
      id: `acct-${index}-0000-4000-8000-000000000000`, label: index === 4 ? "Design team" : `Account ${index}`, current: index === 0, included: true }));
    const list = (query: string) => renderToStaticMarkup(createElement(PromptInputRunAccountPoolAccounts, {
      pool: pool({ enabled: true, accounts: many }), query, onQueryChange: () => {} }));

    test("shows a visible search field above the scrolling list", () => {
      const html = render(pool({ enabled: true, accounts: many }));
      expect(html).toContain('data-testid="run-account-pool-search"');
      expect(html).toContain('aria-label="Search accounts"');
      expect(html).toContain('placeholder="Search by name or ID"');
      expect(html.indexOf("run-account-pool-search")).toBeLessThan(html.indexOf("run-account-pool-list"));
      for (const account of many) expect(html).toContain(account.label);
    });

    test("filters by name or id, and says when nothing matches", () => {
      const byName = list("design");
      expect(byName).toContain("Design team");
      expect(byName).not.toContain("Account 1");
      expect(list("ACCT-2-")).toContain("Account 2");
      expect(list("ACCT-2-")).not.toContain("Design team");
      const none = list("zzz");
      expect(none).toContain("No accounts match “zzz”.");
      expect(none).toContain('role="status"');
    });

    test("the search copy reads in Korean", () => {
      try {
        applyRuntimeLocale("ko");
        expect(list("zzz")).toContain("“zzz” 검색과 일치하는 계정이 없습니다.");
        expect(list("")).toContain('aria-label="계정 검색"');
      } finally {
        applyRuntimeLocale("en");
      }
    });
  });

  test("filterRunAccountPoolAccounts ignores case and surrounding spaces", () => {
    const accounts = [{ id: "system-default", label: "System default" }, { id: "6f1d", label: "Work" }];
    expect(filterRunAccountPoolAccounts(accounts, "  WORK ")).toEqual([accounts[1]]);
    expect(filterRunAccountPoolAccounts(accounts, "")).toEqual(accounts);
    expect(filterRunAccountPoolAccounts(accounts, "system-")).toEqual([accounts[0]]);
  });
});

test("an unknown usage reset reads as Halted · Usage limit with the reason and keeps Resume now", () => {
  const unknown = structuredClone(runs.waiting);
  unknown.agentRun.usageLimit!.resetsAt = null; unknown.agentRun.usageLimit!.resumeAt = null;
  const html = bar(unknown);
  expect(html).toContain("Halted · Usage limit");
  expect(html).toContain("reset time is unknown");
  expect(html).toContain("Resume now");
  expect(html).not.toContain("Running · Waiting");
  expect(card(unknown)).toBe("");
});
