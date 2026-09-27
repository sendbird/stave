/**
 * What the Start mission sheet says and sends. Pure, so the consequence the
 * primary button names is the one the mission will follow.
 */
import type { AutomationPermissionMode } from "@/lib/automations";
import type { CheckIns, Playbook, PlaybookStage } from "@/lib/playbooks/schema";
import { createPlaybookFromStarter, PLAYBOOK_STARTERS } from "@/lib/playbooks/starters";
import { listExternalEffectStages, stageHasExternalEffect, type MissionStartInput } from "./domain";
import { resolveConsentStageSignOff } from "./policy";

export interface StartConsentDraft {
  checkIns: CheckIns;
  permissionMode: AutomationPermissionMode;
  /** External-effect stages the user lets run without asking. */
  authorizedEffectStageIds: readonly string[];
}

/**
 * Indexes of the stages the mission will stop at. Starting signs off the stage
 * it starts at; stages before it never run.
 */
export function listMissionStops(
  playbook: Pick<Playbook, "stages">,
  consent: StartConsentDraft,
  startStageIndex = 0,
): number[] {
  const preview = {
    playbook: playbook as Playbook,
    consent: { checkIns: consent.checkIns, authorizedEffectStageIds: [...consent.authorizedEffectStageIds] },
  };
  return playbook.stages.flatMap((_, index) =>
    index > startStageIndex && resolveConsentStageSignOff(preview, index) === "ask" ? [index] : [],
  );
}

function joinTitles(titles: readonly string[]) {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
}

/** "Stave asks you before Build and Ready for review." */
export function describeMissionStops(
  playbook: Pick<Playbook, "stages">,
  consent: StartConsentDraft,
  startStageIndex = 0,
): string {
  const stops = listMissionStops(playbook, consent, startStageIndex);
  if (stops.length === 0) return "Stave carries it to the end and stops only if a stage is blocked or stuck.";
  return `Stave asks you before ${joinTitles(stops.map((index) => playbook.stages[index]!.title))}.`;
}

/** The primary button: what pressing it sets in motion. */
export function describeStartButton(
  playbook: Pick<Playbook, "stages">,
  consent: StartConsentDraft,
  startStageIndex = 0,
): string {
  const stops = listMissionStops(playbook, consent, startStageIndex);
  const verb = startStageIndex > 0 ? `Start at ${playbook.stages[startStageIndex]?.title ?? "stage"}` : "Start";
  if (stops.length === 0) return `${verb} — runs to the end`;
  if (stops.length <= 2) return `${verb} — asks before ${joinTitles(stops.map((index) => playbook.stages[index]!.title))}`;
  return `${verb} — asks ${stops.length} times`;
}

/** The stages a mission started at `startStageIndex` will run, for its pre-start checks. */
export function remainingStages(playbook: Pick<Playbook, "stages">, startStageIndex: number): Pick<Playbook, "stages"> {
  return { stages: playbook.stages.slice(startStageIndex) };
}

/** What an external-effect stage writes, for its consent row. */
export function describeExternalEffect(stage: PlaybookStage): string | null {
  if (!stageHasExternalEffect(stage)) return null;
  if (stage.kind === "ai") return "Writes outside this machine, such as a message or a ticket.";
  switch (stage.action.type) {
    case "open-draft-pr":
      return "Pushes the branch and opens a draft PR on GitHub.";
    case "watch-checks":
      return "May push repair commits to the PR.";
    case "mark-pr-ready":
      return "Marks the PR ready, which notifies reviewers.";
    case "run-script":
      return `Runs the workspace script “${stage.action.scriptId}”, which may act outside this machine, such as a deploy.`;
  }
}

/** Every external-effect stage, authorized: the sheet's starting point. */
export function defaultAuthorizedEffects(playbook: Pick<Playbook, "stages">): string[] {
  return listExternalEffectStages(playbook).map((stage) => stage.id);
}

export function buildMissionStartInput(args: {
  workspaceId: string;
  taskId: string;
  playbook: Playbook;
  assignment: string;
  consent: StartConsentDraft;
  startStageIndex?: number;
}): MissionStartInput {
  const effectIds = new Set(defaultAuthorizedEffects(args.playbook));
  return {
    workspaceId: args.workspaceId,
    leadTaskId: args.taskId,
    playbook: args.playbook,
    assignment: args.assignment.trim(),
    consent: {
      checkIns: args.consent.checkIns,
      permissionMode: args.consent.permissionMode,
      // Consent is recorded per start, for stages this playbook has.
      authorizedEffectStageIds: args.consent.authorizedEffectStageIds.filter((id) => effectIds.has(id)),
    },
    ...(args.startStageIndex ? { startStageIndex: args.startStageIndex } : {}),
  };
}

/** A playbook choice is a saved playbook id, or a template as `starter:<id>`. */
export const STARTER_CHOICE_PREFIX = "starter:";

export interface PlaybookChoice {
  value: string;
  label: string;
  description: string;
}

/** Saved playbooks first, then the templates not already saved under their name. */
export function listPlaybookChoices(saved: readonly Playbook[]): PlaybookChoice[] {
  return [
    ...saved.map((playbook) => ({
      value: playbook.id,
      label: playbook.name,
      description: `${playbook.stages.length} stages`,
    })),
    ...PLAYBOOK_STARTERS.filter((starter) => !saved.some((playbook) => playbook.name === starter.template.name)).map(
      (starter) => ({
        value: `${STARTER_CHOICE_PREFIX}${starter.id}`,
        label: starter.template.name,
        description: "Template",
      }),
    ),
  ];
}

/** The playbook a choice names, or null when it is gone. */
export function resolvePlaybookChoice(choice: string, saved: readonly Playbook[], now: Date): Playbook | null {
  if (choice.startsWith(STARTER_CHOICE_PREFIX)) {
    const starter = PLAYBOOK_STARTERS.find((candidate) => candidate.id === choice.slice(STARTER_CHOICE_PREFIX.length));
    return starter ? createPlaybookFromStarter(starter, { now, id: `starter_${starter.id}` }) : null;
  }
  return saved.find((playbook) => playbook.id === choice) ?? null;
}

/** The default choice: the first saved playbook, else the Request → PR template. */
export function defaultPlaybookChoice(saved: readonly Playbook[]): string {
  if (saved[0]) return saved[0].id;
  const starter = PLAYBOOK_STARTERS.find((candidate) => candidate.id === "request-to-pr") ?? PLAYBOOK_STARTERS[0]!;
  return `${STARTER_CHOICE_PREFIX}${starter.id}`;
}
