/**
 * Editing operations on stages, for an agent's workflow in the agent editor.
 * Pure.
 */
import {
  DEFAULT_WATCH_CHECKS,
  MAX_PLAYBOOK_STAGES,
  PLAYBOOK_LIMITS,
  STAVE_ACTION_LABELS,
  type ActionStage,
  type AiStage,
  type Playbook,
  type PlaybookStage,
  type SignOff,
  type StaveActionType,
} from "./schema";
import { deriveStageSignOff, resolveStageSignOff } from "./sign-off";

/**
 * A stage id from its title: lowercase words joined by dashes, unique. Dashes
 * are trimmed after shortening, so a long title never leaves one at the end,
 * which the schema refuses.
 */
export function uniqueStageId(title: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, PLAYBOOK_LIMITS.stageId - 4)
      .replace(/^-+|-+$/g, "") || "stage";
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function createBlankAiStage(taken: Iterable<string>, title = "New stage"): AiStage {
  return { id: uniqueStageId(title, taken), title, kind: "ai", instruction: "", doneWhen: "" };
}

export function createActionStage(type: StaveActionType, taken: Iterable<string>): ActionStage {
  const title = STAVE_ACTION_LABELS[type];
  const id = uniqueStageId(title, taken);
  switch (type) {
    case "open-draft-pr":
      return { id, title, kind: "action", action: { type } };
    case "watch-checks":
      return { id, title, kind: "action", action: { type, ...DEFAULT_WATCH_CHECKS } };
    case "mark-pr-ready":
      return { id, title, kind: "action", action: { type } };
    case "run-script":
      return { id, title, kind: "action", action: { type, scriptId: "preview" } };
  }
}

export function moveStage(stages: readonly PlaybookStage[], from: number, to: number): PlaybookStage[] {
  if (from === to || from < 0 || to < 0 || from >= stages.length || to >= stages.length) {
    return [...stages];
  }
  const next = [...stages];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Sets whether the stage at `index` waits for the user. An override that
 * matches what the check-ins would do anyway is removed, so the playbook
 * stays on its preset until the user really departs from it.
 */
export function setStageSignOff<T extends Pick<Playbook, "checkIns" | "stages">>(playbook: T, index: number, next: SignOff): T {
  const derived = deriveStageSignOff(playbook.checkIns, playbook.stages, index);
  const stages = playbook.stages.map((stage, position) => {
    if (position !== index) return stage;
    const { signOff: _previous, ...rest } = stage;
    return (next === derived ? rest : { ...rest, signOff: next }) as PlaybookStage;
  });
  return { ...playbook, stages };
}

/** Choosing a check-in preset clears the per-stage overrides. */
export function applyCheckIns<T extends Pick<Playbook, "checkIns" | "stages">>(playbook: T, checkIns: Playbook["checkIns"]): T {
  return {
    ...playbook,
    checkIns,
    stages: playbook.stages.map((stage) => {
      const { signOff: _override, ...rest } = stage;
      return rest as PlaybookStage;
    }),
  };
}

/** Why a Stave action cannot be added now, or null when it can. */
export function explainActionUnavailable(playbook: Pick<Playbook, "stages">, type: StaveActionType): string | null {
  if (playbook.stages.length >= MAX_PLAYBOOK_STAGES) return `A workflow has at most ${MAX_PLAYBOOK_STAGES} stages.`;
  const present = playbook.stages.some((stage) => stage.kind === "action" && stage.action.type === type);
  if (present) return `The workflow already has "${STAVE_ACTION_LABELS[type]}".`;
  return null;
}

/** Whether the stage at `index` waits for the user under this playbook. */
export function stageAsksFirst(playbook: Pick<Playbook, "checkIns" | "stages">, index: number): boolean {
  return resolveStageSignOff(playbook, index) === "ask";
}

