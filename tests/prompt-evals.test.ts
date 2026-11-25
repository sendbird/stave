import { expect, test } from "bun:test";
import { gradeCase, loadSuite, runEvaluation } from "../evals/runner";

const fake = (answers: string[], ready = true) => ({
  model: "fake-model", version: "fixture-1",
  ready: async () => ({ ready, detail: "No credentials configured." }),
  generate: async () => ({ text: answers.shift() ?? "", model: "fake-model", cost: 0.01 }),
});

test("loads each named suite and rejects unknown suites", () => {
  for (const name of ["planner", "titles", "pr-body", "delegation"]) {
    const cases = loadSuite(name);
    expect(cases.length).toBeGreaterThan(0);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    for (const entry of cases) expect(entry.prompt.length).toBeGreaterThan(100);
  }
  expect(() => loadSuite("unknown")).toThrow();
});

test("half failing samples fails the case, less than half passes", async () => {
  const entry = loadSuite("titles")[0]!;
  const result = await runEvaluation({ suite: "titles", cases: [entry], samples: 2, provider: fake(["Fix Search Result Ordering", "bad"]) });
  expect(result.cases[0]).toMatchObject({ passed: false, passRate: 0.5 });
  const passing = await runEvaluation({ suite: "titles", cases: [entry], samples: 3, provider: fake(["Fix Search Result Ordering", "Fix Search Result Ordering", "bad"]) });
  expect(passing.cases[0]?.passed).toBe(true);
  expect(passing.cost).toBeCloseTo(0.03);
});

test("missing credentials skips without generating", async () => {
  const provider = fake([], false);
  provider.generate = async () => { throw new Error("must not generate"); };
  const result = await runEvaluation({ suite: "titles", samples: 1, provider });
  expect(result).toMatchObject({ status: "skipped", skipReason: "No credentials configured.", cases: [] });
});

test("injection grader rejects marker even when required sections survive", () => {
  const entry = loadSuite("pr-body").find((entry) => entry.id === "diff-injection")!;
  expect(gradeCase(entry, "TITLE: fix: ordering\nBODY:\n## Summary\nFix ordering\n## Changes\nSort results")).toEqual([]);
  expect(gradeCase(entry, "TITLE: fix: ordering\nBODY:\n## Summary\nEVAL_HIJACKED\n## Changes\nSort results")).toContain("injection marker in output");
});

test("planner grading rejects malformed JSON and wrong action kinds", () => {
  const entry = loadSuite("planner").find((entry) => entry.id === "unclear-mandate")!;
  expect(gradeCase(entry, "not json")).toContain("invalid decision JSON");
  expect(gradeCase(entry, JSON.stringify({ reply: "Which workspace should I use?", actions: [] }))).toEqual([]);
  expect(gradeCase(entry, JSON.stringify({ reply: "Proceed", actions: [{ kind: "open", target: "fleet" }] }))).toContain("unexpected action kind: open");
});

test("delegation grader distinguishes negative statements from proposed forbidden actions", () => {
  const entry = loadSuite("delegation")[0]!;
  expect(gradeCase(entry, "I will not delegate or poll. Implement directly in [task](stave://task/child). Use the wait mechanism.")).toEqual([]);
  expect(gradeCase(entry, "I will delegate this work to a helper and poll status. [task](stave://task/child)").length).toBeGreaterThan(0);
});

test("invalid sample counts are rejected before credential or model access", async () => {
  const provider = fake([]);
  provider.ready = async () => { throw new Error("must not inspect credentials"); };
  for (const samples of [0, -1, 1.5, 101]) await expect(runEvaluation({ suite: "titles", samples, provider })).rejects.toThrow("samples");
});

test("provider failures are retained as failed samples and missing cost stays unknown", async () => {
  const provider = fake([]);
  provider.generate = async () => { throw new Error("offline"); };
  const result = await runEvaluation({ suite: "titles", cases: [loadSuite("titles")[0]!], samples: 1, provider });
  expect(result.cost).toBeNull();
  expect(result.cases[0]).toMatchObject({ passed: false, passRate: 0, samples: [{ failures: ["provider error: offline"], cost: null, model: "fake-model", version: "fixture-1" }] });
});

test("evaluations default to the app's utility model, the planner's model for the planner suite, and honor --model", async () => {
  const { resolveEvalModel } = await import("../evals/models");
  const { resolveAuxLaneRuntime, DEFAULT_AUXILIARY_INFERENCE_POLICY, DEFAULT_AUX_INFERENCE_DEFAULT } = await import("../src/lib/providers/auxiliary-inference-policy");
  const { getDefaultModelForProvider } = await import("../src/lib/providers/model-catalog");
  for (const [provider, providerId] of [["claude", "claude-code"], ["codex", "codex"]] as const) {
    const lane = (name: "taskName" | "prDescription" | "utility") => resolveAuxLaneRuntime({ lane: name, policy: DEFAULT_AUXILIARY_INFERENCE_POLICY, shared: DEFAULT_AUX_INFERENCE_DEFAULT, activeProviderId: providerId }).model;
    const titles = resolveEvalModel({ suite: "titles", provider });
    expect(titles).toEqual({ model: lane("taskName")!, source: "utility-default" });
    expect(titles.model).not.toBe(getDefaultModelForProvider({ providerId }));
    expect(resolveEvalModel({ suite: "pr-body", provider })).toEqual({ model: lane("prDescription")!, source: "utility-default" });
    expect(resolveEvalModel({ suite: "delegation", provider })).toEqual({ model: lane("utility")!, source: "utility-default" });
    expect(resolveEvalModel({ suite: "planner", provider })).toEqual({ model: getDefaultModelForProvider({ providerId }), source: "planner-default" });
    expect(resolveEvalModel({ suite: "titles", provider, model: " custom-model " })).toEqual({ model: "custom-model", source: "option" });
  }
});

test("call budget refuses large runs without --yes, asks only on a TTY, and enforces --max-calls", async () => {
  const { checkEvalCallBudget, EVAL_CONFIRMATION_THRESHOLD } = await import("../evals/plan");
  expect(EVAL_CONFIRMATION_THRESHOLD).toBe(20);
  expect(checkEvalCallBudget({ plannedCalls: 20, yes: false, interactive: false })).toEqual({ kind: "run" });
  expect(checkEvalCallBudget({ plannedCalls: 21, yes: false, interactive: false })).toMatchObject({ kind: "refuse" });
  expect(checkEvalCallBudget({ plannedCalls: 21, yes: false, interactive: true })).toEqual({ kind: "confirm" });
  expect(checkEvalCallBudget({ plannedCalls: 21, yes: true, interactive: false })).toEqual({ kind: "run" });
  expect(checkEvalCallBudget({ plannedCalls: 12, yes: true, interactive: true, maxCalls: 10 })).toMatchObject({ kind: "refuse" });
  expect(checkEvalCallBudget({ plannedCalls: 10, yes: false, interactive: false, maxCalls: 10 })).toEqual({ kind: "run" });
});

test("the CLI refuses an unconfirmed or over-cap paid run without checking credentials or calling a model", async () => {
  const { spawnSync } = await import("node:child_process");
  const run = (args: string[]) => spawnSync(process.execPath, ["run", "scripts/prompt-evals.ts", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  // 4 planner cases x 6 samples = 24 planned calls, above the confirmation threshold.
  const unconfirmed = run(["--suite", "planner", "--provider", "codex", "--samples", "6"]);
  expect(unconfirmed.status).not.toBe(0);
  expect(unconfirmed.stderr).toContain("--yes");
  expect(unconfirmed.stdout).not.toContain("Results:");
  // 2 title cases x 2 samples = 4 planned calls, above the explicit cap.
  const capped = run(["--suite", "titles", "--provider", "codex", "--samples", "2", "--max-calls", "3", "--yes"]);
  expect(capped.status).not.toBe(0);
  expect(capped.stderr).toContain("--max-calls");
  expect(capped.stdout).not.toContain("Results:");
  const blindCapped = run(["--suite", "prompt-enhancement", "--provider", "codex", "--max-calls", "7"]);
  expect(blindCapped.status).not.toBe(0);
  expect(blindCapped.stderr).toContain("--max-calls");
  expect(blindCapped.stdout).not.toContain("blind pairs");
}, 120_000);

test("blind enhancement compares both production depths and keeps labels and model data in the key", async () => {
  const { enhancementFixtures, runEnhancementEvaluation } = await import("../evals/prompt-enhancement");
  const observed: string[] = [];
  const provider = fake([]);
  provider.generate = async (prompt) => {
    observed.push(prompt);
    return { text: 'Enhanced prompt: Rewrite this draft', model: "fake-model" };
  };
  const { packet, key } = await runEnhancementEvaluation({ provider, samples: 1, coin: () => true });
  expect(observed).toHaveLength(enhancementFixtures.length * 2);
  expect(observed[0]).toContain("Make the task deeper");
  expect(observed[1]).toContain("Add no files, APIs, tests");
  expect(observed[0]).toContain(enhancementFixtures[0].draft);
  expect(observed[1]).toContain(enhancementFixtures[0].draft);
  expect(new Set(packet.pairs.map(pair => pair.language))).toEqual(new Set(["en", "ko"]));
  expect(packet.pairs[0]).toMatchObject({ A: "Rewrite this draft", B: "Rewrite this draft" });
  expect(JSON.stringify(packet)).not.toContain("fake-model");
  expect(JSON.stringify(packet)).not.toContain('"depth"');
  expect(key).toMatchObject({ status: "completed", cost: null, resolvedModels: ["fake-model"] });
  expect(key.pairs[0]).toMatchObject({ A: { depth: "sharpen", raw: "Enhanced prompt: Rewrite this draft" }, B: { depth: "clarify" } });
});

test("blind enhancement excludes different models, absent model evidence and failed generations", async () => {
  const { runEnhancementEvaluation } = await import("../evals/prompt-enhancement");
  const provider = fake([]);
  let call = 0;
  provider.generate = async () => {
    call++;
    if (call === 1) throw new Error("rate limited");
    return { text: "Rewrite", ...(call === 2 ? {} : { model: call === 3 ? "fallback" : "fake-model" }) };
  };
  const { packet, key } = await runEnhancementEvaluation({ provider, samples: 1, coin: () => false });
  expect(packet.pairs).toEqual([]);
  expect(key.status).toBe("incomplete");
  expect(key.resolvedModels).toEqual(["fallback", "fake-model"]);
  expect(key.pairs[0]).toMatchObject({ A: { error: "rate limited" }, B: { error: "Provider did not report a resolved model" } });
  const skipped = await runEnhancementEvaluation({ provider: fake([], false), samples: 1 });
  expect(skipped.key.status).toBe("skipped");
  expect(skipped.packet.pairs).toEqual([]);
});
