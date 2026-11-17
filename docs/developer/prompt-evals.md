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
prints the reason without generating. Failed cases exit with status 1; a skip
exits successfully and is explicitly labeled, never counted as a pass.

Results are written to `evals/results/<timestamp>.json`, which is ignored
by Git. The file includes provider, model, installed CLI version, each response,
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

All current graders are deterministic; no model judge is used (`judgeModel` is
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
