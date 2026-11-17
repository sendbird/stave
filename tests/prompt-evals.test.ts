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
