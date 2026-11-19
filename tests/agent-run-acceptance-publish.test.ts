import { expect, test } from "bun:test";
import { createStageRecord } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { WorkflowSchema } from "../src/lib/workflows/schema";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunFixture, observe, turn } from "./fixtures/agent-run-fixtures";

// Carry-forward changes acceptance only for an AI stage whose next stage is
// another AI stage. Wherever an action follows, the stage is decided exactly as
// on origin/main (9c0957327) for the same inputs. `MAIN` records main's
// outcomes, obtained by running this file's cases against main's code; set
// STAVE_PRINT_OUTCOMES=1 to print the outcomes the current code produces.

type Criteria = typeof COMPLETE_REPORT.acceptanceCriteria;
type Outcome = "advance" | "block";
const GOAL = "Pasting one image adds exactly one attachment.";
const CHECKS = "Required checks pass locally";
const ASSIGNMENT = "Fix the duplicate paste.";

const ai = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, kind: "ai" as const, instruction: "Do this stage.", doneWhen: "This stage is done.", ...extra });
const action = (id: string, value: object) => ({ id, title: id, kind: "action" as const, action: value });
const OPEN = action("open", { type: "open-draft-pr" });
const WATCH = action("watch", { type: "watch-checks", repairAttempts: 0, timeoutMinutes: 30 });
const READY = action("ready", { type: "mark-pr-ready" });
const SCRIPT = action("script", { type: "run-script", scriptId: "deploy" });

/** The decided stage, the stages before it (each reported `[]`), and the stages after it. */
const SHAPES: { name: string; role?: "plan"; before?: unknown[]; after: unknown[] }[] = [
  { name: "AI->AI", after: [ai("next")] },
  { name: "AI->open-draft-pr", after: [OPEN] },
  { name: "AI->watch-checks", after: [WATCH] },
  { name: "AI->watch-checks->mark-pr-ready", after: [WATCH, READY] },
  { name: "AI->run-script", after: [SCRIPT] },
  { name: "plan->open-draft-pr", role: "plan", after: [OPEN] },
  { name: "AI->AI->open-draft-pr @first AI", after: [ai("next"), OPEN] },
  { name: "AI->AI->open-draft-pr @second AI", before: [ai("lead-in")], after: [OPEN] },
];

/** Earlier stages with their reports, the decided stage's settings and its report. */
const REPORTS: { name: string; earlier?: [unknown, Criteria][]; stage?: Record<string, unknown>; report: Criteria; assignment?: string }[] = [
  { name: "own required criterion unverified (Shipper Validate)", report: [{ text: CHECKS, status: "unverified" }] },
  { name: "own required criterion met", report: [{ text: CHECKS, status: "met" }] },
  { name: "stage-defined criterion unmet", stage: { acceptanceCriteria: [{ text: CHECKS }] }, report: [{ text: CHECKS, status: "unmet" }] },
  { name: "optional criterion unverified", report: [{ text: CHECKS, status: "unverified", required: false }] },
  { name: "planning stage's criterion restated unverified", earlier: [[ai("plan", { role: "plan" }), [{ text: GOAL, status: "unverified" }]]], report: [{ text: GOAL, status: "unverified" }] },
  { name: "criterion the assignment names unmet", report: [{ text: GOAL, status: "unmet" }], assignment: `${ASSIGNMENT} ${GOAL}` },
  { name: "criterion an earlier stage met restated unmet", earlier: [[ai("review"), [{ text: CHECKS, status: "met" }]]], report: [{ text: CHECKS, status: "unmet" }] },
  { name: "criterion an earlier stage left open, not restated", earlier: [[ai("investigate"), [{ text: CHECKS, status: "unverified" }]]], report: [] },
];

function decide(shape: (typeof SHAPES)[number], row: (typeof REPORTS)[number]): Outcome {
  const earlier = [...(row.earlier ?? []), ...(shape.before ?? []).map((stage) => [stage, []] as [unknown, Criteria])];
  const decided = ai("decided", { ...row.stage, ...(shape.role ? { role: shape.role } : {}) });
  const stages = [...earlier.map(([stage]) => stage), decided, ...shape.after];
  const reports = [...earlier.map(([, report]) => report), row.report];
  const base = agentRunFixture();
  const aggregate = agentRunFixture({ workflow: WorkflowSchema.parse({ ...base.agentRun.workflow, checkIns: "when-stuck", stages }) });
  aggregate.agentRun.assignment = row.assignment ?? ASSIGNMENT;
  aggregate.agentRun.currentStageIndex = reports.length - 1;
  aggregate.stages = reports.map((acceptanceCriteria, index) => ({
    ...createStageRecord({ agentRunId: aggregate.agentRun.id, stageId: aggregate.agentRun.workflow.stages[index]!.id, attempt: 1 }),
    status: index === reports.length - 1 ? "running" as const : "completed" as const,
    report: { ...COMPLETE_REPORT, acceptanceCriteria },
  }));
  const decision = decideAgentRunAction({ aggregate, observation: observe({ lastEndedTurn: turn({ turnId: "turn-1" }) }), now: AGENT_RUN_NOW });
  if (decision.action === "complete-stage") return "advance";
  expect(decision).toMatchObject({ action: "block", reason: "acceptance-unmet" });
  return "block";
}

// Main's outcome per report row, for every shape: the decision does not depend
// on what follows the decided stage on main.
const MAIN: Outcome[] = ["block", "advance", "block", "advance", "advance", "advance", "advance", "advance"];
// A planning stage is judged by its own criteria only, on main and here.
const MAIN_PLAN: Outcome[] = ["advance", "advance", "block", "advance", "advance", "advance", "advance", "advance"];
// The intended differences: an early AI stage before another AI stage (a
// Debugger reproduction) may leave a criterion it adds open for later stages.
const BRANCH_AI_TO_AI: Outcome[] = ["advance", "advance", "block", "advance", "advance", "advance", "advance", "advance"];

test("acceptance differs from main only for an AI stage followed by another AI stage", () => {
  const outcomes = Object.fromEntries(SHAPES.map((shape) => [shape.name, REPORTS.map((row) => decide(shape, row))]));
  if (process.env.STAVE_PRINT_OUTCOMES) console.log(JSON.stringify(outcomes, null, 1));
  for (const shape of SHAPES) {
    const main = shape.role === "plan" ? MAIN_PLAN : MAIN;
    const carries = shape.after[0] && (shape.after[0] as { kind: string }).kind === "ai";
    expect({ shape: shape.name, outcomes: outcomes[shape.name] }).toEqual({ shape: shape.name, outcomes: carries ? BRANCH_AI_TO_AI : main });
  }
  // Only the first row differs, and only where an AI stage follows.
  expect(BRANCH_AI_TO_AI.map((outcome, index) => outcome === MAIN[index])).toEqual([false, true, true, true, true, true, true, true]);
});
