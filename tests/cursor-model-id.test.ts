import { describe, expect, test } from "bun:test";
import {
  describeCursorModel,
  formatCursorEffortLabel,
  getCursorModelBaseId,
  listCursorModelParameterLabels,
  parseCursorModelParameters,
} from "@/lib/providers/cursor-model-id";
import { getTurnModelInfoLabel, getTurnModelInfoParts } from "@/lib/providers/turn-model-info";

describe("Cursor model ids", () => {
  test("parses the bracketed parameter list and the base id", () => {
    const model =
      "claude-opus-5[thinking=true,context=300k,effort=high,fast=false]";
    expect(getCursorModelBaseId(model)).toBe("claude-opus-5");
    expect([...parseCursorModelParameters(model).entries()]).toEqual([
      ["thinking", "true"],
      ["context", "300k"],
      ["effort", "high"],
      ["fast", "false"],
    ]);
    // A plain id has nothing to strip.
    expect(getCursorModelBaseId("grok-4.6")).toBe("grok-4.6");
    expect(parseCursorModelParameters("grok-4.6").size).toBe(0);
  });

  test("labels parameters in catalog order and omits the off states", () => {
    expect(
      listCursorModelParameterLabels({
        model:
          "claude-opus-5[thinking=true,context=300k,effort=high,fast=false]",
      }),
    ).toEqual(["300K", "Thinking", "High"]);
    expect(
      listCursorModelParameterLabels({
        model: "gpt-5.6-sol[context=272k,reasoning=medium,fast=true]",
      }),
    ).toEqual(["272K", "Medium", "Fast"]);
  });

  test("normalizes the runtime's effort spellings", () => {
    expect(formatCursorEffortLabel("xhigh")).toBe("X-High");
    expect(formatCursorEffortLabel("extra-high")).toBe("X-High");
    expect(formatCursorEffortLabel("max")).toBe("Max");
    // An unknown value is still shown, just tidied.
    expect(formatCursorEffortLabel("ultra_high")).toBe("Ultra High");
  });

  test("never surfaces bracket syntax when no catalog name is known", () => {
    const described = describeCursorModel("auto-smart[optimize_for=balanced]");
    expect(described.name).toBe("Auto Smart");
    expect(described.details).toEqual(["Balanced"]);
    expect(`${described.name}${described.details.join()}`).not.toContain("[");
  });

  test("splits a runtime display name into its name and detail segments", () => {
    // `toHumanModelName` knows this id statically, so the catalog wording wins
    // and no parameter parsing is needed.
    expect(describeCursorModel("gpt-5.6-sol")).toEqual({
      name: "GPT-5.6 Sol",
      details: [],
    });
  });
});

describe("turn model notation", () => {
  test("structures a Cursor turn instead of printing the raw id", () => {
    const message = {
      providerId: "cursor" as const,
      model: "claude-opus-5[thinking=true,context=300k,effort=high,fast=false]",
    };
    expect(getTurnModelInfoParts(message)).toEqual({
      name: "Claude Opus 5",
      details: ["300K", "Thinking", "High"],
    });
    expect(getTurnModelInfoLabel(message)).toBe(
      "Claude Opus 5 · 300K · Thinking · High",
    );
  });

  test("keeps the other providers' notation byte-identical", () => {
    expect(
      getTurnModelInfoParts({
        providerId: "codex",
        model: "gpt-5.6-terra",
        modelInfo: { effort: "ultra", fastMode: true },
      }),
    ).toEqual({ name: "GPT-5.6 Terra", details: ["Ultra", "Fast"] });
    expect(
      getTurnModelInfoParts({
        providerId: "claude-code",
        model: "claude-opus-4-8[1m]",
        modelInfo: { effort: "xhigh", fastMode: false },
      }),
    ).toEqual({ name: "Claude Opus 4.8 (1M)", details: ["X-High"] });
  });

  test("carries a legacy Cursor turn with no parameters", () => {
    expect(
      getTurnModelInfoParts({
        providerId: "cursor",
        model: "cursor-fixture-model",
      }),
    ).toEqual({ name: "Cursor Fixture Model", details: [] });
  });
});
