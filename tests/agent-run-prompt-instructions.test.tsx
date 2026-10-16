import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n } from "../src/i18n";
import { AgentRunPromptRow, agentRunPromptLayout } from "../src/components/agent-runs/AgentRunPrompt";

// Copy as React writes it into static markup.
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
const label = escape(i18n.t("agentRuns:agentRunPrompt.label"));
const followUp = escape(i18n.t("agentRuns:agentRunPrompt.followUp"));
const pending = escape(i18n.t("agentRuns:agentRunPrompt.pending"));
const render = (props: { text: string | null; kind: "assignment" | "followUp" }) =>
  renderToStaticMarkup(createElement(AgentRunPromptRow, props));

test("the bubble holds only the user's words: a run prompt without them draws no bubble, only its row", () => {
  expect(agentRunPromptLayout(null)).toEqual({ bubble: true, row: null });
  expect(agentRunPromptLayout({ assignment: "Fix the table", instructions: "# Prompt" })).toEqual({ bubble: true, row: "assignment" });
  expect(agentRunPromptLayout({ assignment: "Fix the table", instructions: null })).toEqual({ bubble: true, row: "assignment" });
  expect(agentRunPromptLayout({ assignment: null, instructions: "Report the stage." })).toEqual({ bubble: false, row: "followUp" });
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
