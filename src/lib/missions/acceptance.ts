import type { MissionAggregate, MissionStageRecord } from "./domain";
import { collectAcceptanceCriteria } from "./briefing";
import { revisionsMatch } from "./verification-contract";

/** Reports and successful children do not satisfy an unresolved explicit requirement. */
export function unmetStageAcceptance(aggregate: MissionAggregate, record: MissionStageRecord): string | null {
  const stage = aggregate.mission.playbook.stages[aggregate.mission.currentStageIndex]!;
  const explicit = stage.acceptanceCriteria?.filter((criterion) => criterion.required !== false) ?? [];
  const finalStage = aggregate.mission.currentStageIndex === aggregate.mission.playbook.stages.length - 1;
  const inheritedCriteria = collectAcceptanceCriteria(aggregate);
  const inheritedTexts = new Set(inheritedCriteria.map((criterion) => criterion.text.trim()));
  const optionalTexts = new Set([...inheritedCriteria, ...(stage.acceptanceCriteria ?? [])].filter((criterion) => criterion.required === false).map((criterion) => criterion.text.trim()));
  const goalCriteria = finalStage ? inheritedCriteria.filter((criterion) => criterion.required !== false) : [];
  if (stage.kind === "action") {
    const unresolved = goalCriteria.find((criterion) => criterion.status !== "met" && !explicit.some((current) => current.text.trim() === criterion.text.trim()));
    if (unresolved) return `Acceptance criterion remains unresolved: ${unresolved.text}`;
    if (!explicit.length) return null;
    const action = record.facts?.action;
    return action?.type === "run-script" && action.exitCode === 0 &&
      revisionsMatch(action.verification?.sourceRevision, action.verification?.completedRevision) &&
      revisionsMatch(action.verification?.sourceRevision, record.facts?.workspaceRevision)
      ? null : "The required workspace script check has no successful, current verification evidence.";
  }
  const report = record.report?.outcome === "complete" ? record.report : null;
  const required = new Map(explicit.map((criterion) => [criterion.text.trim(), criterion]));
  // Planning may record criteria for later stages without claiming to have met them.
  if (stage.role !== "plan") {
    for (const criterion of goalCriteria) required.set(criterion.text.trim(), { text: criterion.text });
    for (const criterion of report?.acceptanceCriteria ?? []) {
      const text = criterion.text.trim();
      if (criterion.required !== false && !required.has(text) && !optionalTexts.has(text) && (finalStage || !inheritedTexts.has(text))) required.set(text, { text: criterion.text });
    }
  }
  for (const text of required.keys()) {
    const reported = report?.acceptanceCriteria?.find((entry) => entry.text.trim() === text);
    if (reported?.status !== "met") return `Acceptance criterion remains unresolved: ${text}`;
  }
  return null;
}
