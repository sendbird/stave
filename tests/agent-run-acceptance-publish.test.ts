import { expect, test } from "bun:test";
import { createStageRecord } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { WorkflowSchema } from "../src/lib/workflows/schema";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunFixture, observe, turn } from "./fixtures/agent-run-fixtures";

// Carry-forward between stages must not make publishing looser or stricter.
// The AI stage directly before an action that acts outside the workspace is
// decided as before carry-forward (origin/main 452d10ad4); `main` records that
// decision for the same inputs. Before an action that changes nothing outside
// the workspace, the stage adds no gate main lacks.

type Criteria = typeof COMPLETE_REPORT.acceptanceCriteria;
type Outcome = "advance" | "block";
const GOAL = "Pasting one image adds exactly one attachment.";
const CHECKS = "Required checks pass locally";

const ai = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, kind: "ai" as const, instruction: "Do this stage.", doneWhen: "This stage is done.", ...extra });
const plan = ai("plan", { role: "plan" });
const OUTSIDE_EFFECTS = [
  { type: "open-draft-pr" },
  { type: "mark-pr-ready" },
  { type: "run-script", scriptId: "deploy" },
  { type: "watch-checks", repairAttempts: 2, timeoutMinutes: 30 },
] as const;
const WATCH_ONLY = { type: "watch-checks", repairAttempts: 0, timeoutMinutes: 30 } as const;
const actionStage = (action: object, id = "act") => ({ id, title: id, kind: "action" as const, action });

/** Runs `stages` up to the AI stage at `reports.length - 1`, each report as given, and decides that stage. */
function decideAt(stages: unknown[], reports: Criteria[], assignment = "Fix the duplicate paste.") {
  const base = agentRunFixture();
  const aggregate = agentRunFixture({ workflow: WorkflowSchema.parse({ ...base.agentRun.workflow, checkIns: "when-stuck", stages }) });
  aggregate.agentRun.assignment = assignment;
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

const ROWS: { name: string; stages: (action: object) => unknown[]; reports: Criteria[]; assignment?: string; main: Outcome; branch: Outcome }[] = [
  { name: "a report leaves its own required criterion unverified (Shipper Validate)", stages: (action) => [ai("validate"), actionStage(action)], reports: [[{ text: CHECKS, status: "unverified" }]], main: "block", branch: "block" },
  { name: "a report meets its own required criterion", stages: (action) => [ai("validate"), actionStage(action)], reports: [[{ text: CHECKS, status: "met" }]], main: "advance", branch: "advance" },
  { name: "the stage's defined criterion is unmet", stages: (action) => [ai("work", { acceptanceCriteria: [{ text: CHECKS }] }), actionStage(action)], reports: [[{ text: CHECKS, status: "unmet" }]], main: "block", branch: "block" },
  { name: "an optional criterion is unverified", stages: (action) => [ai("work"), actionStage(action)], reports: [[{ text: CHECKS, status: "unverified", required: false }]], main: "advance", branch: "advance" },
  // A draft pull request may open before the plan's criteria are met.
  { name: "a planning stage reports a criterion unmet", stages: (action) => [plan, actionStage(action)], reports: [[{ text: GOAL, status: "unmet" }]], main: "advance", branch: "advance" },
  { name: "a planning stage's criterion is restated unverified", stages: (action) => [plan, ai("work"), actionStage(action)], reports: [[{ text: GOAL, status: "unverified" }], [{ text: GOAL, status: "unverified" }]], main: "advance", branch: "advance" },
  { name: "a criterion the assignment names is reported unmet", stages: (action) => [ai("work"), actionStage(action)], reports: [[{ text: GOAL, status: "unmet" }]], assignment: `Fix the duplicate paste. ${GOAL}`, main: "advance", branch: "advance" },
  { name: "a criterion an earlier stage met is restated unmet", stages: (action) => [ai("review"), ai("work"), actionStage(action)], reports: [[{ text: CHECKS, status: "met" }], [{ text: CHECKS, status: "unmet" }]], main: "advance", branch: "advance" },
];

test("before an action that acts outside the workspace, a stage is decided as on main", () => {
  for (const action of OUTSIDE_EFFECTS) {
    for (const row of ROWS) {
      expect({ action: action.type, row: row.name, outcome: decideAt(row.stages(action), row.reports, row.assignment) })
        .toEqual({ action: action.type, row: row.name, outcome: row.branch });
      expect(row.branch).toBe(row.main);
    }
  }
});

test("a criterion an earlier AI stage carried forward is due before the outside effect, as at its own stage on main", () => {
  for (const action of OUTSIDE_EFFECTS) {
    const stages = [ai("investigate"), ai("build"), actionStage(action)];
    // Main stops at investigate; carry-forward lets it finish and holds the effect until the criterion is met.
    expect(decideAt(stages, [[{ text: CHECKS, status: "unverified" }]])).toBe("advance");
    expect(decideAt(stages, [[{ text: CHECKS, status: "unverified" }], []])).toBe("block");
    expect(decideAt(stages, [[{ text: CHECKS, status: "unverified" }], [{ text: CHECKS, status: "met" }]])).toBe("advance");
    // The goal the assignment names still carries to the end, as on main.
    expect(decideAt(stages, [[{ text: GOAL, status: "unmet" }], []], `Fix the duplicate paste. ${GOAL}`)).toBe("advance");
  }
});

test("watching checks without repairs adds no gate before it", () => {
  // A criterion that is met only once CI passes stays open until the final stage settles it.
  expect(decideAt([plan, ai("work"), actionStage(WATCH_ONLY)], [[{ text: "CI passes", status: "unverified" }], [{ text: "CI passes", status: "unverified" }]])).toBe("advance");
  expect(decideAt([ai("work"), actionStage(WATCH_ONLY)], [[{ text: "CI passes", status: "unverified" }]])).toBe("advance");
  // The stage's own criteria still gate it.
  expect(decideAt([ai("work", { acceptanceCriteria: [{ text: CHECKS }] }), actionStage(WATCH_ONLY)], [[{ text: CHECKS, status: "unverified" }]])).toBe("block");
  // An outside effect after the watch still waits for the criteria carried past it.
  expect(decideAt([ai("work"), actionStage(WATCH_ONLY, "watch"), ai("wrap"), actionStage({ type: "mark-pr-ready" }, "ready")], [[{ text: CHECKS, status: "unverified" }], [], []])).toBe("block");
});
