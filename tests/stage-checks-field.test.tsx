import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StageChecksField } from "../src/components/workflows/StageChecksField";
import type { AiStage } from "../src/lib/workflows/schema";

const stage: AiStage = { id: "work", title: "Work", kind: "ai", instruction: "Do it.", doneWhen: "Done." };
const check = { text: "Workspace checks pass (lint, test)", required: true, verification: "stave-check" as const, scriptIds: ["lint", "test"] };

function render(next: AiStage, error?: string) {
  return renderToStaticMarkup(createElement(StageChecksField, { stage: next, error, onChange: () => {} }));
}

/** The opening tag of the all/any radio whose label is `label`. */
function radio(markup: string, label: string) {
  return [...markup.matchAll(/<button[^>]*role="radio"[^>]*>(.*?)<\/button>/g)].find((match) => match[1]!.includes(label))?.[0];
}

describe("stage checks field", () => {
  test("without checks it says the agent reports completion and offers Add check", () => {
    const markup = render(stage);
    expect(markup).toContain("Workspace checks");
    expect(markup).toContain("None. The agent reports when this stage is done.");
    expect(markup).toContain("Add check");
    expect(markup).not.toContain('role="radio"');
  });

  test("a check made here lists its scripts with All must pass chosen", () => {
    const markup = render({ ...stage, acceptanceCriteria: [{ ...check, mode: "all" }] });
    expect(markup).toContain("Workspace checks pass (lint, test)");
    expect(markup).toContain("Remove lint from this check");
    expect(markup).toContain("Remove test from this check");
    expect(radio(markup, "All must pass")).toContain('aria-checked="true"');
    expect(radio(markup, "Any one passes")).toContain('aria-checked="false"');
  });

  test("a check saved without a mode shows its original meaning, any one passing", () => {
    const markup = render({ ...stage, acceptanceCriteria: [check] });
    expect(radio(markup, "Any one passes")).toContain('aria-checked="true"');
    expect(radio(markup, "All must pass")).toContain('aria-checked="false"');
  });

  test("a one-script check has no all/any choice, and an optional check says it does not block", () => {
    const markup = render({ ...stage, acceptanceCriteria: [{ ...check, scriptIds: ["lint"], required: false }] });
    expect(markup).not.toContain('role="radio"');
    expect(markup).toContain("Optional: this check does not block the stage.");
  });

  test("agent-reported criteria are not shown as checks, and a criteria error shows under the field", () => {
    const markup = render({ ...stage, acceptanceCriteria: [{ text: "The docs say so", verification: "agent-report" }] }, "Criteria must be unique.");
    expect(markup).not.toContain("The docs say so");
    expect(markup).toContain("Criteria must be unique.");
  });
});
