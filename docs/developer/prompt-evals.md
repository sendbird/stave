# Prompt evaluations

The prompt evaluation runner measures real model output against bounded checks.
It is opt-in: neither CI nor `bun test` runs a model. Unit tests inject a fake
provider. No additional SDK or credentials are required beyond the utility
inference runtime already configured for the app.

```sh
bun run eval:prompts -- --suite planner --provider codex --samples 3
bun run eval:prompts -- --suite titles --provider claude --samples 3
bun run eval:prompts -- --suite pr-body --provider codex --samples 3
bun run eval:prompts -- --suite delegation --provider claude --samples 3
```

**Cost:** this makes paid model calls, one per case and sample. Start with one
sample; larger sample counts multiply cost. Samples must be between 1 and 100.
The runner uses the installed provider's utility readiness gate and read-only,
tool-disabled runtime. With missing credentials it records a skipped result and
prints the reason without generating. Failed cases exit with status 1. A skip in a deterministic suite is explicitly
labeled and exits successfully. The blind suite uses the exit rules below.

Before checking credentials, the runner counts the planned calls (cases ×
samples). A run of more than 20 calls needs `--yes`; in an interactive terminal
it asks for confirmation instead, and without a terminal it refuses. Add
`--max-calls <n>` to refuse any run that plans more than `n` calls, even with
`--yes`:

```sh
bun run eval:prompts -- --suite planner --provider codex --samples 10 --yes --max-calls 40
```

## Model selection

By default each suite uses the model the app uses for that output, so results
and cost match production:

- `planner`: the provider's default conversation model, which is what the
  planner uses until a different model is chosen in the app.
- `titles`, `pr-body` and `delegation`: the app's default Background AI utility
  model for the task-name, PR-description and utility lanes (the provider's
  light tier).

Models changed in the app's settings are not read by this script. Pass
`--model <id>` to evaluate a configured or candidate model; the id must belong
to the selected provider:

```sh
bun run eval:prompts -- --suite titles --provider claude --model <model-id>
```

Results are written to `evals/results/<timestamp>.json`, which is ignored
by Git. The file includes provider, model, how the model was chosen
(`modelSource`: `option`, `planner-default` or `utility-default`), the planned
call count, installed CLI version, each response,
per-sample grader failures, per-case pass rate, and cost in USD when the runtime
reports it. Unreported cost is `null`, not zero. A case fails when at least half
its samples fail; a suite fails when any case fails. Results contain model text;
review them before sharing. Only synthetic fixture data is sent by these cases.

## Suites and limits

- `planner`: source planner prompt plus a fixed world snapshot; strict decision
  JSON, action kind, explicit delegation, unclear mandates, status and forbidden
  publication. Clarification without an action must contain a question.
- `titles`: the source task-name builder; 3–6 words, length, output format and
  task-specific terms. These checks approximate specificity, not literary quality.
- `pr-body`: the source default PR description prompt; title/body format and
  Summary/Changes sections, including instruction injection in both diff and
  project instructions. The injection marker must never appear in the output.
- `delegation`: the actual delegated-child constant and composed execution-lead
  instructions; task links and detectable proposals to delegate or poll. These
  are textual scenario evaluations, not proof of runtime tool enforcement.

These four suites use deterministic graders. No model judge is used (`judgeModel` is
`null`). Passing these checks does not prove complete semantic compliance. If a
future case requires a judge, make its invocation explicit and record its exact
model and cost separately; never hide additional model calls in a grader.

## Adding cases

Add synthetic inputs to `evals/cases.ts`. Import the production prompt builder
or instruction constant; do not copy production prompt prose into fixtures.
Give each case a stable unique id and expected action kinds or a specificity
pattern. Put deterministic assertions in `gradeCase` in `evals/runner.ts` and
cover both passing and adversarial outputs in `tests/prompt-evals.test.ts`.
Run the fake-provider tests before explicitly opting into a real evaluation:

```sh
bun test tests/prompt-evals.test.ts
```

Keep fixtures small and independent of local repositories, secrets and accounts.
Do not add this command to the normal test scripts or CI workflows.

## Blind Clarify and Sharpen comparison

```sh
bun run eval:prompts -- --suite prompt-enhancement --provider codex --model gpt-6-luna --samples 1 --max-calls 8
```

The suite sends each of four synthetic drafts through both production prompt
builders and applies the production output parser. The cap covers both depths
(2 English + 2 Korean drafts × 2 depths × sample count). The CLI saves the
randomized A/B packet as `<timestamp>.blind.json` and the depth labels, raw
responses, native model evidence and errors as `<timestamp>.key.json`. Both use
the ignored results directory by default. Use `--output-dir` to override it.

Score the blind packet against its rubric before opening the key. Cite the
text for each judgment. Compare faithfulness and clarity on every draft and
assess method and decision ownership only when applicable. Treat ties as ties.
Depth-specific writing can hint at which is which. The task does not incur a
paid judge call. A missing response or model identity makes that pair
unscorable. If native metadata shows different models anywhere in the run,
the comparison is invalid. A skipped or incomplete comparison exits with
status 1 and preserves available diagnostics.

### Observed runs

On November 25, 2026, two runs produced eight scoreable pairs from 16 calls.
Codex App Server reported `gpt-6-luna` for all 16. The second run used the
explicitly resolved Codex CLI 0.172.0. One reviewer scored each A/B packet before
looking at its depth key.

| Draft | Clarify | Sharpen |
| --- | --- | --- |
| English scroll jump | Preserved pagination and the requested fix. | Preserved scope and added reproduction, source inspection and a scroll-anchoring check. |
| English explanation only | Preserved the language and the constraint against edits. | Switched to Korean in the first run. Both outputs retained the constraint against edits, and the second kept English and asked for first-hand evidence. |
| Korean duplicate restore | Preserved the path and literal skill token. | Added a concrete reproduction and check. The first raw output included the skill token in backticks, which output parsing removed. The second kept the token. |
| Korean search tradeoff | Preserved the requested comparison and reserved the loading decision. | Added latency and request-count measurements and reserved the loading decision. In both samples the opening directive could be read as asking for implementation. |

This comparison covers two samples per draft and depth, one model and one
reviewer. It measures rewrite text, without executing the rewritten tasks. The utility
runtime did not report USD cost.
