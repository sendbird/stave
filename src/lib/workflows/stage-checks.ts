import { i18n } from "@/i18n/runtime";
import type { AiStage, WorkspaceCheckMode } from "./schema";

/**
 * Editing an AI stage's workspace checks: criteria that Stave verifies by
 * running the workspace's action scripts itself. A check made here names its
 * scripts and needs all of them by default (D21). A stored check keeps the
 * meaning it was saved with; only the user's own edit changes it.
 */
export type StageCheckCriterion = NonNullable<AiStage["acceptanceCriteria"]>[number];

export interface StageCheck {
  /** Position in the stage's `acceptanceCriteria`. */
  index: number;
  criterion: StageCheckCriterion;
}

/** "Workspace checks pass (lint, test)": the name a check made here gets. */
export function stageCheckText(scriptIds: readonly string[]): string {
  return `${i18n.t("agentRuns:workspaceCheck.criterion")} (${scriptIds.join(", ")})`;
}

export function listStageChecks(stage: AiStage): StageCheck[] {
  return (stage.acceptanceCriteria ?? []).flatMap((criterion, index) => criterion.verification === "stave-check" ? [{ index, criterion }] : []);
}

/** A new check on one script; it needs all of the scripts it later lists. */
export function addStageCheck(stage: AiStage, scriptId: string): { stage: AiStage; index: number } {
  const criteria = stage.acceptanceCriteria ?? [];
  const criterion: StageCheckCriterion = { text: stageCheckText([scriptId]), required: true, verification: "stave-check", scriptIds: [scriptId], mode: "all" };
  return { stage: { ...stage, acceptanceCriteria: [...criteria, criterion] }, index: criteria.length };
}

/**
 * Adds or removes one script. A name this editor generated follows the new
 * list; a name the user or an older version wrote stays. Bindings frozen by an
 * earlier run are dropped: the next start binds the current definitions. A
 * check left without scripts is removed, because it could never run.
 */
export function toggleStageCheckScript(stage: AiStage, index: number, scriptId: string): AiStage {
  const criterion = stage.acceptanceCriteria?.[index];
  if (!criterion) return stage;
  const current = criterion.scriptIds ?? [];
  const scriptIds = current.includes(scriptId) ? current.filter((id) => id !== scriptId) : [...current, scriptId];
  if (!scriptIds.length) return removeStageCheck(stage, index);
  const { scriptDefinitions: _bound, ...rest } = criterion;
  const text = criterion.text === stageCheckText(current) ? stageCheckText(scriptIds) : criterion.text;
  return replaceCriterion(stage, index, { ...rest, text, scriptIds });
}

export function setStageCheckMode(stage: AiStage, index: number, mode: WorkspaceCheckMode): AiStage {
  const criterion = stage.acceptanceCriteria?.[index];
  return criterion ? replaceCriterion(stage, index, { ...criterion, mode }) : stage;
}

export function removeStageCheck(stage: AiStage, index: number): AiStage {
  const criteria = (stage.acceptanceCriteria ?? []).filter((_, position) => position !== index);
  const { acceptanceCriteria: _criteria, ...rest } = stage;
  return criteria.length ? { ...rest, acceptanceCriteria: criteria } : rest;
}

function replaceCriterion(stage: AiStage, index: number, criterion: StageCheckCriterion): AiStage {
  return { ...stage, acceptanceCriteria: (stage.acceptanceCriteria ?? []).map((entry, position) => position === index ? criterion : entry) };
}
