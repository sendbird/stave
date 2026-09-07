import { describe, expect, test } from "bun:test";
import {
  buildCursorAcpClientCapabilities,
  isCursorParameterizedCatalog,
  listCursorAdvertisedEfforts,
  listCursorSessionParameterUpdates,
  resolveAdvertisedCursorModelId,
} from "../electron/providers/cursor/cursor-session-config";
import type { AcpSessionConfigOption } from "../electron/providers/acp/acp-schemas";

const parameterizedOptions: AcpSessionConfigOption[] = [
  {
    id: "model",
    name: "Model",
    type: "select",
    currentValue: "auto",
    options: [
      { value: "auto", name: "Auto" },
      { value: "gpt-5.6-sol", name: "gpt-5.6-sol" },
    ],
  },
  {
    id: "effort",
    name: "Effort",
    type: "select",
    currentValue: "medium",
    options: [
      { value: "low", name: "Low" },
      { value: "medium", name: "Medium" },
      { value: "high", name: "High" },
    ],
  },
  {
    id: "fast",
    name: "Fast",
    type: "select",
    currentValue: "false",
    options: [
      { value: "true", name: "On" },
      { value: "false", name: "Off" },
    ],
  },
];

describe("Cursor session config", () => {
  test("adds the parameterized picker capability without dropping other fields", () => {
    expect(
      buildCursorAcpClientCapabilities({
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      }),
    ).toEqual({
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
      _meta: { parameterizedModelPicker: true },
    });
  });

  test("treats advertised effort or fast options as a parameterized catalog", () => {
    expect(isCursorParameterizedCatalog(parameterizedOptions)).toBe(true);
    expect(
      isCursorParameterizedCatalog([
        {
          id: "model",
          name: "Model",
          type: "select",
          currentValue: "auto",
          options: [{ value: "auto", name: "Auto" }],
        },
      ]),
    ).toBe(false);
  });

  test("lists only advertised effort values", () => {
    expect(
      listCursorAdvertisedEfforts(
        parameterizedOptions.find((option) => option.id === "effort"),
      ),
    ).toEqual(["low", "medium", "high"]);
  });

  test("matches a stored bracketed model to the advertised bare id", () => {
    expect(
      resolveAdvertisedCursorModelId({
        requestedModel: "gpt-5.6-sol[context=272k,reasoning=high,fast=true]",
        advertised: ["auto", "gpt-5.6-sol"],
      }),
    ).toBe("gpt-5.6-sol");
  });

  test("queues effort and fast updates and skips current or unknown values", () => {
    expect(
      listCursorSessionParameterUpdates({
        configOptions: parameterizedOptions,
        effort: "high",
        fastMode: true,
      }),
    ).toEqual([
      { configId: "effort", value: "high" },
      { configId: "fast", value: "true" },
    ]);
    expect(
      listCursorSessionParameterUpdates({
        configOptions: parameterizedOptions,
        effort: "medium",
        fastMode: false,
      }),
    ).toEqual([]);
    expect(
      listCursorSessionParameterUpdates({
        configOptions: parameterizedOptions,
        effort: "ultra",
        fastMode: true,
      }),
    ).toEqual([{ configId: "fast", value: "true" }]);
  });
});
