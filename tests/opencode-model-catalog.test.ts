import { afterEach, describe, expect, test } from "bun:test";
import {
  OPENCODE_MODEL_CATALOG_MAX_ENTRIES,
  buildOpenCodeModelCatalogArgs,
  getOpenCodeModelCatalog,
  parseOpenCodeModelCatalog,
  splitOpenCodeModelId,
} from "../electron/providers/opencode/opencode-model-catalog";
import type { runExecutableProbe } from "../electron/providers/runtime-shared";
import {
  listOpenCodeModelEfforts,
  registerOpenCodeModelEfforts,
} from "@/lib/providers/opencode-model-efforts";
import {
  buildModelEffortRuntimeOverrides,
  listModelEffortOptions,
} from "@/lib/providers/model-effort";
import { listModelEfforts } from "@/components/ai-elements/model-effort-selector.utils";

/** Shape of `opencode models --verbose` on 1.19.0: an id line, then its JSON. */
const V1_VERBOSE_OUTPUT = [
  "opencode/big-pickle",
  JSON.stringify(
    {
      id: "big-pickle",
      providerID: "opencode",
      name: "Big Pickle",
      limit: { context: 200000, output: 32000 },
      variants: {},
    },
    null,
    2,
  ),
  "vercel/zai/glm-5.3",
  JSON.stringify(
    {
      id: "zai/glm-5.3",
      providerID: "vercel",
      name: "GLM 5.3",
      limit: { context: 1048576 },
      // A brace inside a string must not end the object early.
      description: "Uses {braces} in text",
      variants: { high: {}, turbo: {}, low: {} },
    },
    null,
    2,
  ),
  "anthropic/claude-sonnet-5-5",
  JSON.stringify({ name: "Claude Sonnet 5.5", variants: { max: {}, minimal: {} } }, null, 2),
].join("\n");

/** Shape of `opencode models --standalone` on 2.0.29: ids only. */
const V2_OUTPUT = [
  "opencode/exo-free",
  "opencode/big-pickle",
  "vercel/deepseek/deepseek-v4",
  "",
].join("\n");

function probeStub(responses: Record<string, Partial<Awaited<ReturnType<typeof runExecutableProbe>>>>) {
  const calls: string[][] = [];
  const run: typeof runExecutableProbe = async (args) => {
    calls.push([...args.commandArgs]);
    const key = args.commandArgs.join(" ");
    const response = responses[key] ?? { status: 1 };
    const stdout = response.stdout ?? "";
    return {
      status: 0,
      signal: null,
      error: "",
      stderr: "",
      timedOut: false,
      ...response,
      stdout,
      text: response.text ?? stdout,
    };
  };
  return { run, calls };
}

afterEach(() => {
  registerOpenCodeModelEfforts([]);
});

describe("OpenCode model catalog parsing", () => {
  test("splits provider prefixes from multi-segment model ids", () => {
    expect(splitOpenCodeModelId("vercel/zai/glm-5.3")).toEqual({
      provider: "vercel",
      name: "zai/glm-5.3",
    });
    expect(splitOpenCodeModelId("plain")).toEqual({ provider: "", name: "plain" });
  });

  test("reads names, context and supported efforts from 1.x verbose output", () => {
    const entries = parseOpenCodeModelCatalog(V1_VERBOSE_OUTPUT);
    expect(entries.map((entry) => entry.model)).toEqual([
      "anthropic/claude-sonnet-5-5",
      "opencode/big-pickle",
      "vercel/zai/glm-5.3",
    ]);
    expect(entries.find((entry) => entry.model === "vercel/zai/glm-5.3")).toEqual({
      model: "vercel/zai/glm-5.3",
      displayName: "GLM 5.3",
      description: "vercel/zai/glm-5.3 · 1M context",
      hidden: false,
      isDefault: false,
      defaultEffort: null,
      // `turbo` is not a level Stave can send, so it is not offered.
      supportedEfforts: ["high", "low"],
      group: "vercel",
    });
    expect(entries.find((entry) => entry.model === "opencode/big-pickle")).toMatchObject({
      displayName: "Big Pickle",
      description: "opencode/big-pickle · 200K context",
      supportedEfforts: [],
      group: "opencode",
    });
  });

  test("reads 2.x id lines and groups them by provider", () => {
    const entries = parseOpenCodeModelCatalog(V2_OUTPUT);
    expect(entries.map((entry) => [entry.group, entry.model, entry.displayName])).toEqual([
      ["opencode", "opencode/big-pickle", "big-pickle"],
      ["opencode", "opencode/exo-free", "exo-free"],
      ["vercel", "vercel/deepseek/deepseek-v4", "deepseek/deepseek-v4"],
    ]);
    // The CLI names no default; Stave's `auto` row stands for OpenCode's pick.
    expect(entries.some((entry) => entry.isDefault)).toBe(false);
  });

  test("ignores noise lines and duplicate ids", () => {
    const entries = parseOpenCodeModelCatalog(
      ["Loading models...", "opencode/big-pickle", "opencode/big-pickle", "not a model"].join("\n"),
    );
    expect(entries.map((entry) => entry.model)).toEqual(["opencode/big-pickle"]);
  });

  test("handles hundreds of models and bounds the list", () => {
    const many = Array.from({ length: 600 }, (_, index) => `vercel/vendor-${index % 7}/model-${index}`);
    expect(parseOpenCodeModelCatalog(many.join("\n"))).toHaveLength(600);
    const tooMany = Array.from(
      { length: OPENCODE_MODEL_CATALOG_MAX_ENTRIES + 50 },
      (_, index) => `openrouter/model-${index}`,
    );
    expect(parseOpenCodeModelCatalog(tooMany.join("\n"))).toHaveLength(
      OPENCODE_MODEL_CATALOG_MAX_ENTRIES,
    );
  });

  test("uses --verbose on 1.x and --standalone on 2.x", () => {
    expect(buildOpenCodeModelCatalogArgs(1)).toEqual(["models", "--verbose"]);
    expect(buildOpenCodeModelCatalogArgs(2)).toEqual(["models", "--standalone"]);
  });
});

describe("OpenCode model catalog read", () => {
  const runtimeOptions = { opencodeBinaryPath: process.execPath };

  test("loads the 1.x catalog through the verbose listing", async () => {
    const { run, calls } = probeStub({
      "--version": { stdout: "1.19.0" },
      "models --verbose": { stdout: V1_VERBOSE_OUTPUT },
    });
    const catalog = await getOpenCodeModelCatalog({ runtimeOptions, runProbe: run });
    expect(calls).toEqual([["--version"], ["models", "--verbose"]]);
    expect(catalog.ok).toBe(true);
    expect(catalog.models).toHaveLength(3);
  });

  test("loads the 2.x catalog without leaving the background service running", async () => {
    const { run, calls } = probeStub({
      "--version": { stdout: "opencode v2.0.29" },
      "models --standalone": { stdout: V2_OUTPUT },
    });
    const catalog = await getOpenCodeModelCatalog({ runtimeOptions, runProbe: run });
    expect(calls).toEqual([["--version"], ["models", "--standalone"]]);
    expect(catalog.models.map((entry) => entry.model)).toContain("vercel/deepseek/deepseek-v4");
  });

  test("refuses an unsupported version without listing models", async () => {
    const { run, calls } = probeStub({ "--version": { stdout: "1.18.0" } });
    const catalog = await getOpenCodeModelCatalog({ runtimeOptions, runProbe: run });
    expect(calls).toEqual([["--version"]]);
    expect(catalog).toMatchObject({ providerId: "opencode", ok: false, models: [] });
    expect(catalog.detail).toContain("Unsupported OpenCode version 1.18.0");
  });

  test("reports a failed or timed-out listing as an empty catalog with a reason", async () => {
    for (const [response, detail] of [
      [{ status: 1 }, "OpenCode could not list its models."],
      [{ status: null, timedOut: true }, "OpenCode did not list its models in time."],
    ] as const) {
      const { run } = probeStub({
        "--version": { stdout: "1.19.0" },
        "models --verbose": response,
      });
      await expect(getOpenCodeModelCatalog({ runtimeOptions, runProbe: run })).resolves.toEqual({
        providerId: "opencode",
        ok: false,
        detail,
        models: [],
      });
    }
  });

  test("tells the user how to connect a provider when no model is listed", async () => {
    const { run } = probeStub({
      "--version": { stdout: "1.19.0" },
      "models --verbose": { stdout: "" },
    });
    const catalog = await getOpenCodeModelCatalog({ runtimeOptions, runProbe: run });
    expect(catalog.ok).toBe(false);
    expect(catalog.detail).toContain("opencode auth login");
    expect(catalog.detail).toContain("npx vercel ai-gateway setup --agent opencode");
  });
});

describe("OpenCode effort selection", () => {
  const option = (model: string, supportedEfforts: string[]) => ({
    key: `opencode:${model}`,
    providerId: "opencode" as const,
    model,
    label: model,
    supportedEfforts,
  });

  test("offers only the levels a model's variants include", () => {
    expect(
      listModelEfforts(option("vercel/zai/glm-5.3", ["high", "low"]) as never).map(
        (effort) => effort.value,
      ),
    ).toEqual(["low", "high"]);
    // No variants (or a 2.x catalog): no effort control at all.
    expect(listModelEfforts(option("opencode/big-pickle", []) as never)).toEqual([]);
  });

  test("sends an effort only when the catalog lists it for that model", () => {
    registerOpenCodeModelEfforts([
      ["vercel/zai/glm-5.3", ["high"]],
      ["opencode/big-pickle", []],
    ]);
    expect(listOpenCodeModelEfforts("vercel/zai/glm-5.3")).toEqual(["high"]);
    expect(
      listModelEffortOptions({ providerId: "opencode", model: "vercel/zai/glm-5.3" }).map(
        (effort) => effort.value,
      ),
    ).toEqual(["high"]);
    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "opencode",
        model: "vercel/zai/glm-5.3",
        effort: "high",
      }),
    ).toEqual({ opencodeEffort: "high" });
    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "opencode",
        model: "vercel/zai/glm-5.3",
        effort: "medium",
      }),
    ).toEqual({});
    expect(
      buildModelEffortRuntimeOverrides({
        providerId: "opencode",
        model: "opencode/big-pickle",
        effort: "high",
      }),
    ).toEqual({});
  });
});
