import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleMinus, CirclePause, CircleX, Clock, Hand, ShieldCheck, ShieldQuestion, Square } from "lucide-react";
import { agentStateDotTone, agentStateTone, agentStateWorkState, type AgentRunState } from "../src/components/ads/components/agent-state";
import { StateMark } from "../src/components/ads/components/StateMark";
import { StatusDot, statusDotWorkState } from "../src/components/ads/components/StatusDot";
import { WORK_STATE, WORK_STATES } from "../src/components/ads/components/state-vocabulary";
import { AGENT_RUN_BADGE_LABELS } from "../src/lib/agent-runs/agent-run-status";

describe("work state vocabulary", () => {
  test("each state has the fixed glyph, and no two states share glyph and tone", () => {
    expect(WORK_STATE["needs-you"].icon).toBe(Hand);
    expect(WORK_STATE.ready.icon).toBe(CircleCheck);
    expect(WORK_STATE.failed.icon).toBe(CircleX);
    expect(WORK_STATE.stopped.icon).toBe(Square);
    expect(WORK_STATE.queued.icon).toBe(CircleDashed);
    expect(WORK_STATE.idle.icon).toBe(CircleDashed);
    expect(WORK_STATE.skipped.icon).toBe(CircleMinus);
    expect(WORK_STATE.approval.icon).toBe(ShieldQuestion);
    expect(WORK_STATE.approval.icon).not.toBe(ShieldCheck);
    // A wait is a clock, a pause the pause glyph, a halt the alert circle.
    expect(WORK_STATE.waiting.icon).toBe(Clock);
    expect(WORK_STATE.paused.icon).toBe(CirclePause);
    expect(WORK_STATE.halted.icon).toBe(CircleAlert);
    // Unknown is not idle.
    expect(WORK_STATE.unknown.icon).toBe(CircleHelp);
    expect(WORK_STATE.unknown.icon).not.toBe(WORK_STATE.idle.icon);
    const seen = WORK_STATES.map((state) => `${WORK_STATE[state].icon.displayName}:${WORK_STATE[state].tone}`);
    expect(new Set(seen).size).toBe(WORK_STATES.length);
  });

  test("only working pulses", () => {
    expect(WORK_STATES.filter((state) => WORK_STATE[state].pulses)).toEqual(["working"]);
  });

  test("the dot, the run states and the agent-run labels read from the vocabulary", () => {
    for (const [status, state] of Object.entries(statusDotWorkState)) {
      const html = renderToStaticMarkup(createElement(StatusDot, { status: status as keyof typeof statusDotWorkState }));
      expect(html).toContain(`aria-label="${WORK_STATE[state].label}"`);
    }
    for (const [state, work] of Object.entries(agentStateWorkState) as Array<[AgentRunState, keyof typeof WORK_STATE]>) {
      expect(agentStateTone[state]).toBe(WORK_STATE[work].tone as never);
      expect(agentStateDotTone[state]).toBe(WORK_STATE[work].tone);
    }
    for (const badge of ["paused", "halted", "stopped"] as const) expect(AGENT_RUN_BADGE_LABELS[badge]).toBe(WORK_STATE[badge].label);
  });

  test("the state mark is decorative unless it carries a label, and shows the word when asked", () => {
    expect(renderToStaticMarkup(createElement(StateMark, { state: "ready" }))).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(createElement(StateMark, { state: "failed", label: "Failed" }));
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Failed"');
    const worded = renderToStaticMarkup(createElement(StateMark, { state: "needs-you", showLabel: true }));
    expect(worded).toContain(WORK_STATE["needs-you"].label);
    expect(worded).not.toContain("aria-hidden=\"true\" data-state");
    expect(worded).toContain('data-state="needs-you"');
  });

  test("the state mark draws the vocabulary glyph, or a domain glyph in the state color", () => {
    expect(renderToStaticMarkup(createElement(StateMark, { state: "halted" }))).toContain("lucide-circle-alert");
    // Working moves with the one agent-working motion; held still it keeps its glyph.
    const working = renderToStaticMarkup(createElement(StateMark, { state: "working" }));
    expect(working).toContain('data-ads-loader-variant="matrix"');
    expect(working).toContain('data-motion="moving"');
    expect(renderToStaticMarkup(createElement(StateMark, { state: "working", motion: "still" }))).toContain("lucide-circle-dot");
    expect(renderToStaticMarkup(createElement(StateMark, { state: "halted", icon: Square }))).toContain("lucide-square");
  });
});
