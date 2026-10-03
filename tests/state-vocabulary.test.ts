import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleCheck, CircleDashed, CircleHelp, CircleMinus, CircleX, Hand, ShieldCheck, ShieldQuestion, Square } from "lucide-react";
import { agentStateDotTone, agentStateTone, agentStateWorkState, type AgentRunState } from "../src/components/ads/components/agent-state";
import { StateIcon } from "../src/components/ads/components/StateIcon";
import { StatusDot, statusDotWorkState } from "../src/components/ads/components/StatusDot";
import { WORK_STATE, WORK_STATES } from "../src/components/ads/components/state-vocabulary";
import { AGENT_RUN_VIEW_STATE_LABELS } from "../src/lib/agent-runs/agent-run-status";

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
    expect(AGENT_RUN_VIEW_STATE_LABELS.stopped).toBe(WORK_STATE.stopped.label);
  });

  test("the state icon is decorative unless it carries a label", () => {
    expect(renderToStaticMarkup(createElement(StateIcon, { state: "ready" }))).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(createElement(StateIcon, { state: "failed", label: "Failed" }))).toContain('aria-label="Failed"');
  });
});
