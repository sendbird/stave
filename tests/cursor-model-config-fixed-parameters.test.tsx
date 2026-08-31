import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CursorModelConfigList } from "@/components/ai-elements/cursor-model-config-list";
import type { ModelSelectorOption } from "@/components/ai-elements/model-selector.utils";

function option(model: string, label: string): ModelSelectorOption {
  return {
    key: `cursor:${model}`,
    providerId: "cursor",
    model,
    label,
    available: true,
  };
}

describe("Cursor model configuration rows", () => {
  // Real `agent 2026.08.25` advertises exactly one variant per base model, and
  // `session/set_model` rejects anything else with `-32602 Invalid model value`.
  const singleVariant = renderToStaticMarkup(
    createElement(CursorModelConfigList, {
      options: [
        option(
          "claude-opus-5[thinking=true,context=300k,effort=high,fast=false]",
          "claude-opus-5",
        ),
      ],
      onChoose: () => {},
    }),
  );

  test("shows an unchangeable parameter as a label, not a control", () => {
    expect(singleVariant).toContain('data-cursor-fixed-capability="true"');
    expect(singleVariant).toContain("300K");
    expect(singleVariant).toContain("Thinking");
    expect(singleVariant).toContain("High");
    // The only button left is the model itself.
    expect(
      [...singleVariant.matchAll(/data-cursor-control-key="/g)].length,
    ).toBe(1);
    expect(singleVariant).not.toContain("effort, unavailable");
  });

  test("omits a fixed parameter that is off rather than printing a dead label", () => {
    // `fast=false` is fixed here, so a "Fast" chip would claim a capability the
    // model does not have.
    expect(singleVariant).not.toContain(">Fast<");
  });

  test("keeps real controls where Cursor advertises a second variant", () => {
    const twoVariants = renderToStaticMarkup(
      createElement(CursorModelConfigList, {
        options: [
          option(
            "gpt-5.4[context=272k,reasoning=medium,fast=false]",
            "gpt-5.4",
          ),
          option("gpt-5.4[context=272k,reasoning=high,fast=true]", "gpt-5.4"),
        ],
        onChoose: () => {},
      }),
    );
    // Fast and effort both vary, so both stay interactive; context does not.
    expect(twoVariants).toContain("gpt-5.4, Fast off");
    expect(twoVariants).toContain("Medium effort");
    expect(twoVariants).toContain('data-cursor-fixed-capability="true"');
    expect(twoVariants).toContain("272K");
  });
});
