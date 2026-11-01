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
