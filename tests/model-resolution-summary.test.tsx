import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatActualRunModel,
  ModelResolutionSummary,
} from "@/components/session/ModelResolutionSummary";

test("run model label carries the dispatched effort next to the model", () => {
  expect(
    formatActualRunModel({
      providerId: "claude-code",
      model: "claude-fable-5-1",
      modelInfo: { effort: "high" },
    }),
  ).toBe("Claude Code · Claude Fable 5.1 · High");
  expect(
    formatActualRunModel({
      providerId: "codex",
      model: "gpt-5.6-terra",
      modelInfo: { effort: "xhigh", fastMode: true },
    }),
  ).toContain("· X-High · Fast");
  // Records without effort stay as they were; unknown providers print raw.
  expect(
    formatActualRunModel({ providerId: "codex", model: "gpt-5.6-terra" }),
  ).not.toContain("·  ");
  expect(formatActualRunModel({ providerId: "other", model: "m-1" })).toBe(
    "other · m-1",
  );
});

test("summary renders the effort in the Run model row", () => {
  const html = renderToStaticMarkup(
    createElement(ModelResolutionSummary, {
      actual: {
        providerId: "claude-code",
        model: "claude-fable-5-1",
        modelInfo: { effort: "max" },
      },
    }),
  );
  expect(html).toContain("Run model");
  expect(html).toContain("Claude Code · Claude Fable 5.1 · Max");
});
