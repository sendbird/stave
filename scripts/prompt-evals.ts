import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { SuiteNameSchema, loadSuite } from "../evals/cases";
import { resolveEvalModel } from "../evals/models";
import { checkEvalCallBudget } from "../evals/plan";
import { createEvalProvider } from "../evals/provider";
import { enhancementFixtures, runEnhancementEvaluation } from "../evals/prompt-enhancement";
import { runEvaluation } from "../evals/runner";

const OptionsSchema = z.object({
  suite: z.union([SuiteNameSchema, z.literal("prompt-enhancement")]),
  "output-dir": z.string().min(1).default("evals/results"),
  provider: z.enum(["claude", "codex"]),
  samples: z.coerce.number().int().min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  "max-calls": z.coerce.number().int().min(1).optional(),
  yes: z.boolean().default(false),
}).strict();

async function confirm(question: string) {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try { return /^y(es)?$/i.test((await prompt.question(question)).trim()); }
  finally { prompt.close(); }
}

async function main() {
  const argv = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  const { values } = parseArgs({ args: argv, options: {
    suite: { type: "string" }, provider: { type: "string" }, samples: { type: "string", default: "1" },
    "output-dir": { type: "string" }, model: { type: "string" }, "max-calls": { type: "string" }, yes: { type: "boolean" },
  }, strict: true });
  const options = OptionsSchema.parse(values);
  const cases = options.suite === "prompt-enhancement" ? [] : loadSuite(options.suite);
  const promptsPerSample = options.suite === "prompt-enhancement" ? enhancementFixtures.length * 2 : cases.length;
  const plannedCalls = promptsPerSample * options.samples;
  // Decided before credentials are checked or any model is called.
  const budget = checkEvalCallBudget({ plannedCalls, yes: options.yes, maxCalls: options["max-calls"], interactive: Boolean(process.stdin.isTTY && process.stderr.isTTY) });
  if (budget.kind === "refuse") throw new Error(budget.reason);
  if (budget.kind === "confirm" && !await confirm(`Run ${plannedCalls} paid model calls? [y/N] `)) throw new Error("Cancelled; no model was called.");
  const { model, source } = resolveEvalModel({ suite: options.suite, provider: options.provider, model: options.model });
  console.error(`Opt-in prompt evaluation: ${plannedCalls} paid calls (${promptsPerSample} prompts x ${options.samples} samples) with ${model}. Results may contain model output and fixture data.`);
  const provider = await createEvalProvider(options.provider, model);
  try {
    const directory = options["output-dir"];
    await mkdir(directory, { recursive: true });
    const prefix = `${directory}/${new Date().toISOString().replaceAll(":", "-")}`;
    if (options.suite === "prompt-enhancement") {
      const { packet, key } = await runEnhancementEvaluation({ provider, samples: options.samples });
      await writeFile(`${prefix}.blind.json`, JSON.stringify(packet, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      await writeFile(`${prefix}.key.json`, JSON.stringify({ ...key, provider: options.provider, modelSource: source, plannedCalls }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      console.log(`${key.status}: ${packet.pairs.length} blind pairs. Packet: ${prefix}.blind.json`);
      if (key.skipReason) console.error(key.skipReason);
      if (key.status !== "completed") process.exitCode = 1;
      return;
    }
    const result = await runEvaluation({ suite: options.suite, samples: options.samples, cases, provider });
    const path = `${prefix}.json`;
    await writeFile(path, JSON.stringify({ ...result, provider: options.provider, modelSource: source, plannedCalls }, null, 2) + "\n", { mode: 0o600 });
    if (result.status === "skipped") console.error(`Skipped: ${result.skipReason}`);
    else for (const entry of result.cases) console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.id}: ${(entry.passRate * 100).toFixed(1)}%`);
    console.log(`Results: ${path}`);
    if (result.cases.some((entry) => !entry.passed)) process.exitCode = 1;
  } finally {
    provider.dispose();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
