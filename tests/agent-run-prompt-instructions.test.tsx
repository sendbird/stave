import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../src/i18n";
import { AgentRunPromptRow, AgentRunStageCard, agentRunPromptLayout } from "../src/components/agent-runs/AgentRunPrompt";
import type { AgentRunPromptStage } from "../src/lib/agent-runs/agent-run-status";

const REVIEW_STAGE: AgentRunPromptStage = {
  index: 1,
  total: 3,
  title: "Review",
  doneWhen: "The review lists each defect with file, line and reason, or says it found none.",
  instruction: "Independently review the previous stage's result against the assignment without changing files.",
};

// Copy as React writes it into static markup.
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const label = escape(i18n.t("agentRuns:agentRunPrompt.label"));
const followUp = escape(i18n.t("agentRuns:agentRunPrompt.followUp"));
const pending = escape(i18n.t("agentRuns:agentRunPrompt.pending"));
const render = (props: { text: string | null; kind: "assignment" | "followUp" }) =>
  renderToStaticMarkup(createElement(AgentRunPromptRow, props));

test("the bubble holds only the user's words: a run prompt without them draws no bubble, only its row", () => {
  expect(agentRunPromptLayout(null)).toEqual({ bubble: true, row: null, stage: null });
  expect(agentRunPromptLayout({ assignment: "Fix the table", instructions: "# Prompt", stage: null })).toEqual({ bubble: true, row: "assignment", stage: null });
  expect(agentRunPromptLayout({ assignment: "Fix the table", instructions: null, stage: null })).toEqual({ bubble: true, row: "assignment", stage: null });
  expect(agentRunPromptLayout({ assignment: null, instructions: "Report the stage.", stage: null })).toEqual({ bubble: false, row: "followUp", stage: null });
});

test("a stage after the first draws Stave's stage card instead of repeating the assignment as the user's bubble", () => {
  // The prompt still carries the assignment (the full prompt row keeps it), but the bubble gives way to the card.
  expect(agentRunPromptLayout({ assignment: "Fix the table", instructions: "# Prompt", stage: REVIEW_STAGE })).toEqual({
    bubble: false,
    row: "assignment",
    stage: REVIEW_STAGE,
  });
  const markup = renderToStaticMarkup(createElement(AgentRunStageCard, { stage: REVIEW_STAGE }));
  expect(markup).toContain(escape(i18n.t("agentRuns:agentRunPrompt.stageTitle", { index: 2, total: 3, title: "Review" })));
  expect(markup).toContain(escape(i18n.t("agentRuns:agentRunPrompt.stageDoneWhen", { value: REVIEW_STAGE.doneWhen })));
  // The instruction waits behind the disclosure; the assignment is nowhere on the card.
  expect(markup).toMatch(/<button[^>]*aria-expanded="false"/);
  expect(markup).not.toContain("Independently review");
  expect(markup).not.toContain("Fix the table");
});

test("under the user's bubble, the row names the full prompt Stave sent and stays folded", () => {
  const markup = render({ text: "## Assignment\n\ncompiled prompt", kind: "assignment" });
  expect(markup).toContain(label);
  expect(markup).not.toContain(followUp);
  expect(markup).toMatch(/<button[^>]*aria-expanded="false"/);
  // Folded: the prompt is not in the DOM, and there is no copy action yet.
  expect(markup).not.toContain("compiled prompt");
  expect(markup.match(/<button/g)?.length).toBe(1);
  // A live control, not the dead button the row used to be while the run caught up.
  expect(markup).not.toMatch(/\sdisabled[=\s>]/);
  expect(markup).not.toContain('aria-disabled="true"');
});

test("a run prompt with no assignment names its row as Stave's follow-up", () => {
  const markup = render({ text: "Report the stage.", kind: "followUp" });
  expect(markup).toContain(followUp);
  expect(markup).not.toContain(label);
});

test("while the run has not written its prompt, a status holds the row's place instead of a dead button", () => {
  const markup = render({ text: null, kind: "assignment" });
  expect(markup).toContain(pending);
  expect(markup).toContain('role="status"');
  expect(markup).not.toContain("<button");
  expect(markup).not.toContain(label);
});

// The hook's data path, over a seeded store state and without React: which
// reads a row needs, what the selectors return, and the prompt view built from
// them. A row finds its stage card from its mark, or through the run's events
// when the mark predates stages (or is absent).
import { agentRunPromptRowSources, resolveAgentRunPromptRow } from "../src/components/agent-runs/AgentRunPrompt";
import { agentRunTaskKey, selectAgentRunById, selectAgentRunDetailForTurn } from "../src/store/agent-runs-store";
import { AGENT_RUN_ASSIGNMENT, buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import type { AgentRunPromptProvenance } from "../src/types/chat";

test("a mark without its stage, as rows were written before stages were recorded, still finds the stage through the run's events", () => {
  const base = buildAgentRunFixtures(new Date("2026-10-01T09:00:00.000Z")).working;
  const [work] = base.agentRun.workflow.stages;
  const stages = [
    work!,
    { id: "review", title: "Review", kind: "ai", instruction: "Review it.", doneWhen: "Reviewed." },
    { id: "fix-review", title: "Fix review findings", kind: "ai", instruction: "Fix it.", doneWhen: "Fixed." },
  ] as unknown as typeof base.agentRun.workflow.stages;
  const agentRun = { ...base.agentRun, workflow: { ...base.agentRun.workflow, stages } };
  const linked = (stageId: string, turnId: string) => ({ ...base.events[0]!, kind: "turn-linked" as const, detail: { stageId, attempt: 1, turnId } });
  const detail: AgentRunDetail = { ...base, agentRun, events: [linked("work", "turn-1"), linked("review", "turn-2"), linked("review", "turn-3")] };
  const workspaceId = agentRun.workspaceId;
  const taskId = agentRun.leadTaskId;
  const state = {
    agentRunIdsByTask: { [agentRunTaskKey(workspaceId, taskId)]: [agentRun.id] },
    details: { [agentRun.id]: detail },
    dividersByAgentRun: { [agentRun.id]: new Map([["turn-1", "Stage 1"], ["turn-2", "Stage 2"], ["turn-3", "Stage 2 — reminder"]]) },
  };
  const stagePrompt = `# Implementer — Stage 2 of 3: Review\n\n## Assignment\n\n${AGENT_RUN_ASSIGNMENT}\n\n## This stage: Review\n\nReview it.`;
  // As the hook does: pick the reads, run the selectors, build the view.
  const layoutOf = (props: { turnId: string; text: string; provenance?: AgentRunPromptProvenance }) => {
    const sources = agentRunPromptRowSources(props);
    const layout = agentRunPromptLayout(resolveAgentRunPromptRow({
      ...props,
      markedRun: selectAgentRunById(state, sources.markedRunId),
      detail: selectAgentRunDetailForTurn(state, workspaceId, taskId, sources.detailTurnId),
    }));
    return { bubble: layout.bubble, row: layout.row, stage: layout.stage?.index ?? null };
  };
  const legacyMark = { agentRunId: agentRun.id, assignment: AGENT_RUN_ASSIGNMENT };
  // The mark names no stage, so the row reads the run's events, and the turn-linked event for the turn names it.
  expect(agentRunPromptRowSources({ turnId: "turn-2", provenance: legacyMark })).toEqual({ detailTurnId: "turn-2", markedRunId: agentRun.id });
  expect(layoutOf({ turnId: "turn-2", text: stagePrompt, provenance: legacyMark })).toEqual({ bubble: false, row: "assignment", stage: 1 });
  // The first stage keeps the user's bubble, mark or no mark.
  expect(layoutOf({ turnId: "turn-1", text: stagePrompt, provenance: legacyMark })).toEqual({ bubble: true, row: "assignment", stage: null });
  expect(layoutOf({ turnId: "turn-1", text: stagePrompt })).toEqual({ bubble: true, row: "assignment", stage: null });
  // A mark that names its stage needs no events; an unmarked row reads them.
  const markedStage = { ...legacyMark, stageIndex: 1, stageId: "review" };
  expect(agentRunPromptRowSources({ turnId: "turn-2", provenance: markedStage })).toEqual({ detailTurnId: undefined, markedRunId: agentRun.id });
  expect(layoutOf({ turnId: "turn-2", text: stagePrompt, provenance: markedStage })).toEqual({ bubble: false, row: "assignment", stage: 1 });
  expect(layoutOf({ turnId: "turn-2", text: stagePrompt })).toEqual({ bubble: false, row: "assignment", stage: 1 });
  // The reminder to report carries no assignment: Stave's follow-up row, never a stage card.
  expect(layoutOf({ turnId: "turn-3", text: "Report the stage.", provenance: { agentRunId: agentRun.id, assignment: null } })).toEqual({ bubble: false, row: "followUp", stage: null });
  // A turn the run never linked falls back to the plain message; a pending send reads nothing.
  expect(layoutOf({ turnId: "turn-9", text: "Hello" })).toEqual({ bubble: true, row: null, stage: null });
  expect(agentRunPromptRowSources({ turnId: "turn-2", pending: true })).toEqual({ detailTurnId: undefined, markedRunId: undefined });
});
