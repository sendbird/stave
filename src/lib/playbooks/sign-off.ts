import type { CheckIns, Playbook, PlaybookStage, SignOff } from "./schema";

type SignOffInput = Pick<Playbook, "checkIns" | "stages">;

function stageAt(stages: PlaybookStage[], index: number): PlaybookStage {
  const stage = stages[index];
  if (!stage) {
    throw new RangeError(
      `Stage index ${index} is outside a playbook with ${stages.length} stages.`,
    );
  }
  return stage;
}

function asksUnderPlanAndPublishing(
  stages: PlaybookStage[],
  index: number,
): boolean {
  const stage = stageAt(stages, index);
  const previous = stages[index - 1];
  if (previous?.kind === "ai" && previous.role === "plan") return true;
  if (stage.kind === "ai") return stage.role === "publish";
  return stage.action.type === "mark-pr-ready";
}

/**
 * The sign-off a stage gets from the playbook's check-in level alone, ignoring
 * the stage's own override. Starting a mission signs off its first stage, so
 * the first stage never waits.
 *
 * | Check-ins           | Asks before                                         |
 * | ------------------- | --------------------------------------------------- |
 * | every-stage         | every stage                                         |
 * | plan-and-publishing | the stage after a plan stage, publish stages and    |
 * |                     | mark-pr-ready                                       |
 * | when-stuck          | nothing; blockers and stuck stages still stop       |
 */
export function deriveStageSignOff(
  checkIns: CheckIns,
  stages: PlaybookStage[],
  index: number,
): SignOff {
  stageAt(stages, index);
  if (index === 0) return "auto";
  switch (checkIns) {
    case "every-stage":
      return "ask";
    case "plan-and-publishing":
      return asksUnderPlanAndPublishing(stages, index) ? "ask" : "auto";
    case "when-stuck":
      return "auto";
  }
}

/** The sign-off a mission applies before starting the stage at `index`. */
export function resolveStageSignOff(
  playbook: SignOffInput,
  index: number,
): SignOff {
  const stage = stageAt(playbook.stages, index);
  if (index === 0) return "auto";
  return stage.signOff ?? deriveStageSignOff(playbook.checkIns, playbook.stages, index);
}

/** Indexes of the stages that wait for the user's sign-off. */
export function listSignOffStageIndexes(playbook: SignOffInput): number[] {
  return playbook.stages.flatMap((_, index) =>
    resolveStageSignOff(playbook, index) === "ask" ? [index] : [],
  );
}
