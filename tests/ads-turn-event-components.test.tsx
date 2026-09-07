import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { Approval } from "@/components/ads/components/Approval";
import { Citation } from "@/components/ads/components/Citation";
import { Clarification } from "@/components/ads/components/Clarification";
import { Thinking } from "@/components/ads/components/Thinking";
import { ToolRun } from "@/components/ads/components/ToolRun";
import { agentStateLabel } from "@/components/ads/components/agent-state";
import {
  TraceApproval,
  TraceClarification,
  TracePlan,
  planProgressCount,
} from "@/components/session/message/turn-event-decisions";
import { TraceSystemNotice } from "@/components/session/message/turn-event-notice";
import type { ApprovalPart, UserInputPart } from "@/types/chat";

function todoInput(
  todos: readonly { content: string; status: string }[],
): string {
  return JSON.stringify({ todos });
}

const approvalPart = (state: ApprovalPart["state"]): ApprovalPart => ({
  description: "Delete the build directory",
  input: "rm -rf build",
  requestId: "req-1",
  state,
  supportsAllowAlways: true,
  toolName: "Bash",
  type: "approval",
});

const userInputPart = (state: UserInputPart["state"]): UserInputPart => ({
  answers: state === "input-responded" ? { deploy: "Staging" } : undefined,
  questions: [
    {
      header: "deploy",
      key: "deploy",
      options: [
        { description: "Safe", label: "Staging" },
        { description: "Live", label: "Production" },
      ],
      question: "Which environment should this deploy to?",
      required: true,
    },
  ],
  requestId: "req-2",
  state,
  toolName: "AskUser",
  type: "user_input",
});

/**
 * The turn-event family was missing from the installed ADS copy, which is why
 * the transcript hand-rolled every one of these surfaces. These tests do two
 * things: prove the ported files actually render in this host (they came from a
 * revision with a different tsconfig and a different `utils/stylex`), and pin
 * the behaviours the transcript will depend on when it adopts them, so a later
 * re-sync cannot quietly drop one.
 */
describe("ADS turn-event components", () => {
  test("ToolRun renders a row, not a card, and names its own state", () => {
    const markup = renderToStaticMarkup(
      <ToolRun
        status="running"
        title="Search the changelog"
        tool="repo.grep"
        count="12 matches"
        startedAt={Date.now() - 4200}
        now={Date.now()}
      />,
    );
    expect(markup).toContain("Search the changelog");
    expect(markup).toContain("repo.grep");
    expect(markup).toContain("12 matches");
    expect(markup).toContain(agentStateLabel.running);
    expect(markup).toContain('data-tool-run-status="running"');
  });

  test("a ToolRun with a payload stays closed while running", () => {
    const markup = renderToStaticMarkup(
      <ToolRun
        status="running"
        title="Read the file"
        input="{ path: 'README.md' }"
        output="# Stave"
        startedAt={Date.now() - 1000}
        now={Date.now()}
      />,
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Arguments");
    expect(markup).toContain("Output");
  });

  test("a failed ToolRun stays expanded and offers exactly one recovery action", () => {
    // `isAttentionState` owns the list of states that keep their payload on
    // screen; a failure that auto-collapsed would hide the only thing worth
    // reading.
    const markup = renderToStaticMarkup(
      <ToolRun
        status="failed"
        title="Run the tests"
        error="exit 1"
        onRetry={() => {}}
      />,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("exit 1");
    expect(markup).toContain("Retry");
    expect(markup).toContain('role="alert"');
  });

  test("a ToolRun group rolls its runs up to the most urgent state", () => {
    const markup = renderToStaticMarkup(
      <ToolRun.Group
        rollUp
        runs={[
          { status: "done", durationMs: 100 },
          { status: "failed", durationMs: 200 },
        ]}
      >
        <ToolRun status="done" title="First" />
        <ToolRun status="failed" title="Second" />
      </ToolRun.Group>,
    );
    expect(markup).toContain("2 tool calls");
    expect(markup).toContain(agentStateLabel.failed);
    expect(markup).toContain('data-tool-run-group-status="failed"');
  });

  test("Thinking reports a measured duration and never invents one", () => {
    const settled = renderToStaticMarkup(
      <Thinking status="settled" durationMs={14_200}>
        Comparing the two migrations.
      </Thinking>,
    );
    expect(settled).toContain("Thought for");
    expect(settled).toContain("14.2s");

    // No start instant, no recorded duration: the component has nothing true to
    // say about the wait, so it says nothing rather than animating a plausible
    // number.
    const unmeasured = renderToStaticMarkup(
      <Thinking status="settled">Some trace.</Thinking>,
    );
    expect(unmeasured).toContain("Finished thinking");
    expect(unmeasured).not.toMatch(/Thought for/);
  });

  test("Thinking with a trace stays closed while the model is thinking", () => {
    const markup = renderToStaticMarkup(
      <Thinking phase="Reading the changelog" status="thinking">
        Comparing the two migrations.
      </Thinking>,
    );
    expect(markup).toContain("Reading the changelog");
    expect(markup).toContain("Comparing the two migrations.");
    expect(markup).toContain('aria-expanded="false"');
  });

  test("Thinking with no trace is one row rather than an empty disclosure", () => {
    const markup = renderToStaticMarkup(
      <Thinking phase="Reading the changelog" status="thinking" />,
    );
    expect(markup).toContain("Reading the changelog");
    expect(markup).not.toContain("aria-expanded");
  });

  test("Citation renders an inline mark and a source list from one shape", () => {
    const mark = renderToStaticMarkup(
      <Citation index={2} source="stave.dev" title="Install guide" />,
    );
    expect(mark).toContain("2");
    expect(mark).toContain("Source 2: Install guide");

    const list = renderToStaticMarkup(
      <Citation.List
        defaultOpen
        detail="detailed"
        sources={[
          {
            excerpt: "Packaged builds check for updates.",
            href: "https://stave.dev/install",
            id: "s1",
            index: 1,
            source: "stave.dev",
            title: "Install guide",
          },
        ]}
      />,
    );
    expect(list).toContain("Sources");
    expect(list).toContain("Install guide");
    expect(list).toContain("Packaged builds check for updates.");
    expect(list).toContain('target="_blank"');
  });

  test("Plan renders Stave's three todo states through the ADS marks", () => {
    const markup = renderToStaticMarkup(
      <TracePlan
        input={todoInput([
          { content: "Read the config", status: "completed" },
          { content: "Patch the runtime", status: "in_progress" },
          { content: "Run the tests", status: "pending" },
        ])}
        state="output-available"
      />,
    );
    expect(markup).toContain("Read the config");
    expect(markup).toContain("Patch the runtime");
    expect(markup).toContain("Run the tests");
    // The mark is aria-hidden, so status reaches assistive tech as row text.
    expect(markup).toContain("Done");
    expect(markup).toContain("Running");
    expect(markup).toContain("Pending");
    // Counted, never estimated: top-level steps only, and no percentage.
    expect(markup).toContain("1 of 3 steps complete");
    expect(markup).not.toContain("%");
  });

  test("the collapsed plan row still carries its progress count", () => {
    expect(
      planProgressCount(
        todoInput([
          { content: "a", status: "completed" },
          { content: "b", status: "pending" },
        ]),
      ),
    ).toBe("1 / 2");
    // No steps is not "0 / 0": that is a progress readout for nothing.
    expect(planProgressCount("{}")).toBeUndefined();
  });

  test("an open approval offers the three decisions and no record", () => {
    const markup = renderToStaticMarkup(
      <TraceApproval
        messageId="m1"
        part={approvalPart("approval-requested")}
        taskId="t1"
      />,
    );
    expect(markup).toContain("Needs your approval");
    expect(markup).toContain("Allow once");
    expect(markup).toContain("Always allow");
    expect(markup).toContain("Deny");
    // The gate is an attention state: the payload it is about stays on screen.
    expect(markup).toContain("rm -rf build");
    expect(markup).toContain('data-pending-interaction="true"');
  });

  test("a resolved approval preserves what was approved and states no scope Stave did not record", () => {
    const markup = renderToStaticMarkup(
      <TraceApproval
        messageId="m1"
        part={approvalPart("approval-responded")}
        taskId="t1"
      />,
    );
    // §5: Stave keeps "answered", not which grant, so the record is "Allowed".
    expect(markup).toContain("Allowed");
    expect(markup).not.toContain("Allowed once");
    expect(markup).not.toContain("Always allowed");
    // The decision survives being made: the arguments are still readable.
    expect(markup).toContain("rm -rf build");
    expect(markup).not.toContain("Allow once");
  });

  test("an interrupted approval is withdrawn, not denied", () => {
    const markup = renderToStaticMarkup(
      <TraceApproval
        messageId="m1"
        part={approvalPart("approval-interrupted")}
        taskId="t1"
      />,
    );
    expect(markup).toContain("Withdrawn");
    expect(markup).not.toContain("Denied");
    expect(markup).not.toContain("Deny");
  });

  test("Approval's lapsed resolution takes neutral ink, never danger", () => {
    const lapsed = renderToStaticMarkup(
      <Approval outcome={{ decision: "lapsed" }} title="Write the file" />,
    );
    const denied = renderToStaticMarkup(
      <Approval outcome={{ decision: "deny" }} title="Write the file" />,
    );
    expect(lapsed).toContain("Withdrawn");
    expect(denied).toContain("Denied");
    // Different tone classes: a lapse is not a refusal.
    expect(lapsed).not.toBe(denied);
  });

  test("a clarification asks with ADS controls and keeps its answer afterwards", () => {
    const open = renderToStaticMarkup(
      <TraceClarification
        messageId="m1"
        part={userInputPart("input-requested")}
        taskId="t1"
      />,
    );
    expect(open).toContain("Needs your input");
    expect(open).toContain("Which environment should this deploy to?");
    expect(open).toContain("Staging");
    expect(open).toContain("Production");
    expect(open).toContain('role="radiogroup"');
    expect(open).toContain("Submit");

    const answered = renderToStaticMarkup(
      <TraceClarification
        messageId="m1"
        part={userInputPart("input-responded")}
        taskId="t1"
      />,
    );
    expect(answered).toContain("Answered");
    expect(answered).toContain("Recorded answer");
    expect(answered).toContain("deploy: Staging");
    expect(answered).not.toContain("Submit");
  });

  test("an interrupted clarification is withdrawn rather than skipped", () => {
    const markup = renderToStaticMarkup(
      <TraceClarification
        messageId="m1"
        part={userInputPart("input-interrupted")}
        taskId="t1"
      />,
    );
    expect(markup).toContain("Withdrawn");
    expect(markup).not.toContain("Skipped");
  });

  test("Clarification's own outcome vocabulary distinguishes all three ends", () => {
    for (const [result, word] of [
      ["answered", "Answered"],
      ["skipped", "Skipped"],
      ["lapsed", "Withdrawn"],
    ] as const) {
      const markup = renderToStaticMarkup(
        <Clarification outcome={{ result }} title="Pick a branch" />,
      );
      expect(markup).toContain(word);
    }
  });

  test("a system notice is a row with a disclosure, and a failure stays open", () => {
    const quiet = renderToStaticMarkup(
      <TraceSystemNotice title="Context compacted">
        <p>Trigger: auto</p>
      </TraceSystemNotice>,
    );
    expect(quiet).toContain("Context compacted");
    expect(quiet).toContain('aria-expanded="false"');

    const failure = renderToStaticMarkup(
      <TraceSystemNotice attention status="failed" title="Provider overloaded">
        <p>Retry in a moment.</p>
      </TraceSystemNotice>,
    );
    expect(failure).toContain("Failed");
    expect(failure).toContain('aria-expanded="true"');
  });

  test("a notice with no payload is a line, not an empty disclosure", () => {
    const markup = renderToStaticMarkup(
      <TraceSystemNotice title="Turn interrupted" />,
    );
    expect(markup).toContain("Turn interrupted");
    expect(markup).not.toContain("aria-expanded");
  });
});
