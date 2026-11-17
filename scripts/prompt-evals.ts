import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { SuiteNameSchema } from "../evals/cases";
import { createEvalProvider } from "../evals/provider";
import { runEvaluation } from "../evals/runner";

const OptionsSchema = z.object({ suite: SuiteNameSchema, provider: z.enum(["claude", "codex"]), samples: z.coerce.number().int().min(1).max(100) }).strict();

async function main() {
  const argv = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  const { values } = parseArgs({ args: argv, options: { suite: { type: "string" }, provider: { type: "string" }, samples: { type: "string", default: "1" } }, strict: true });
  const options = OptionsSchema.parse(values);
  console.error(`Opt-in prompt evaluation: up to ${options.samples} paid calls per case. Results may contain model output and fixture data.`);
  const provider = await createEvalProvider(options.provider);
  const result = await runEvaluation({ ...options, provider });
  await mkdir("evals/results", { recursive: true });
  const path = `evals/results/${new Date().toISOString().replaceAll(":", "-")}.json`;
  await writeFile(path, JSON.stringify({ ...result, provider: options.provider }, null, 2) + "\n", { mode: 0o600 });
  if (result.status === "skipped") console.error(`Skipped: ${result.skipReason}`);
  else for (const entry of result.cases) console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.id}: ${(entry.passRate * 100).toFixed(1)}%`);
  console.log(`Results: ${path}`);
  if (result.cases.some((entry) => !entry.passed)) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
