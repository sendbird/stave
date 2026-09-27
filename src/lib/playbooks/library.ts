/**
 * Editing operations on saved playbooks, shared by the Playbooks tab and the
 * Start mission sheet. Pure: callers pass `now` and write the result through
 * `updateSettings({ patch: { playbooks } })`, which validates it again.
 */
import { generatePlaybookId } from "./normalize";
import {
  DEFAULT_CHECK_INS,
  DEFAULT_WATCH_CHECKS,
  MAX_PLAYBOOKS,
  MAX_PLAYBOOK_STAGES,
  PLAYBOOK_LIMITS,
  PLAYBOOK_VERSION,
  STAVE_ACTION_LABELS,
  type ActionStage,
  type AiStage,
  type Playbook,
  type PlaybookStage,
  type SignOff,
  type StaveActionType,
} from "./schema";
import { deriveStageSignOff, listSignOffStageIndexes, resolveStageSignOff } from "./sign-off";

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

/** The name, or the name with the first free number after it. */
export function uniquePlaybookName(name: string, taken: readonly Playbook[]): string {
  return uniqueName(name, taken);
}

/** JSON with object keys sorted, so the same content always reads the same. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : entry,
  );
}

/** Whether two playbooks hold the same content, whatever order their keys were written in. */
export function playbooksEqual(left: Playbook, right: Playbook): boolean {
  return stableJson(left) === stableJson(right);
}

/**
 * Why another playbook cannot be added to the saved ones, or null when it
 * can. Settings keep at most `MAX_PLAYBOOKS`, so saving one more would drop
 * it. Replacing a saved playbook (same `id`) is always allowed.
 */
export function explainPlaybookLimit(saved: readonly Pick<Playbook, "id">[], id?: string): string | null {
  if (id !== undefined && saved.some((playbook) => playbook.id === id)) return null;
  if (saved.length < MAX_PLAYBOOKS) return null;
  return `You have ${MAX_PLAYBOOKS} playbooks, the most Stave keeps. Delete one to add another.`;
}

/** Whether a new playbook (or the one with this `id`) fits among the saved ones. */
export function canAddPlaybook(saved: readonly Pick<Playbook, "id">[], id?: string): boolean {
  return explainPlaybookLimit(saved, id) === null;
}

/** Whether two playbooks run the same way: purpose, check-ins, constraints and stages. */
export function playbooksRunAlike(left: Playbook, right: Playbook): boolean {
  const shape = (playbook: Playbook) =>
    JSON.stringify([playbook.purpose, playbook.checkIns, playbook.constraints, playbook.stages]);
  return shape(left) === shape(right);
}

function uniqueName(name: string, taken: readonly Playbook[]): string {
  const names = new Set(taken.map((playbook) => playbook.name));
  if (!names.has(name)) return name;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${name} ${suffix}`.slice(0, PLAYBOOK_LIMITS.name);
    if (!names.has(candidate)) return candidate;
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

/** A new playbook with one empty AI stage, ready to be filled in. */
export function createBlankPlaybook(args: { now: Date; taken: readonly Playbook[] }): Playbook {
  const timestamp = args.now.toISOString();
  return {
    version: PLAYBOOK_VERSION,
    id: generatePlaybookId(),
    name: uniqueName("Untitled playbook", args.taken),
    purpose: "",
    checkIns: DEFAULT_CHECK_INS,
    team: "solo",
    stages: [createBlankAiStage([])],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * A copy with a fresh id and name. The shortcut and the start conditions stay
 * with the original: copied conditions carry the original's `since` stamps,
 * so the copy would propose old issues again and run the schedule twice.
 */
export function duplicatePlaybook(args: { playbook: Playbook; now: Date; taken: readonly Playbook[] }): Playbook {
  const timestamp = args.now.toISOString();
  const { shortcut: _shortcut, startsWhen: _startsWhen, ...rest } = args.playbook;
  return {
    ...structuredClone(rest),
    id: generatePlaybookId(),
    name: uniqueName(`${args.playbook.name} copy`.slice(0, PLAYBOOK_LIMITS.name), args.taken),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function upsertPlaybook(list: readonly Playbook[], playbook: Playbook): Playbook[] {
  const index = list.findIndex((candidate) => candidate.id === playbook.id);
  if (index === -1) return [...list, playbook];
  return list.map((candidate, position) => (position === index ? playbook : candidate));
}

export function removePlaybook(list: readonly Playbook[], id: string): Playbook[] {
  return list.filter((candidate) => candidate.id !== id);
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
export function setStageSignOff(playbook: Playbook, index: number, next: SignOff): Playbook {
  const derived = deriveStageSignOff(playbook.checkIns, playbook.stages, index);
  const stages = playbook.stages.map((stage, position) => {
    if (position !== index) return stage;
    const { signOff: _previous, ...rest } = stage;
    return (next === derived ? rest : { ...rest, signOff: next }) as PlaybookStage;
  });
  return { ...playbook, stages };
}

/** Choosing a check-in preset clears the per-stage overrides. */
export function applyCheckIns(playbook: Playbook, checkIns: Playbook["checkIns"]): Playbook {
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
  if (playbook.stages.length >= MAX_PLAYBOOK_STAGES) return `A playbook has at most ${MAX_PLAYBOOK_STAGES} stages.`;
  const present = playbook.stages.some((stage) => stage.kind === "action" && stage.action.type === type);
  if (present) return `This playbook already has "${STAVE_ACTION_LABELS[type]}".`;
  return null;
}

function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
}

/**
 * Where a playbook stops for the user, in one sentence: "Asks before Build
 * and Ready for review", "Asks before every stage", "Stops only when stuck".
 */
export function describeSignOffs(playbook: Pick<Playbook, "checkIns" | "stages">): string {
  const indexes = listSignOffStageIndexes(playbook);
  if (indexes.length === 0) return "Stops only when stuck or blocked";
  if (indexes.length === playbook.stages.length - 1 && playbook.stages.length > 2) return "Asks before every stage";
  return `Asks before ${joinTitles(indexes.map((index) => playbook.stages[index]!.title))}`;
}

/** Whether the stage at `index` waits for the user under this playbook. */
export function stageAsksFirst(playbook: Pick<Playbook, "checkIns" | "stages">, index: number): boolean {
  return resolveStageSignOff(playbook, index) === "ask";
}

/**
 * Validation issues ("stages.2.instruction: Instruction is required.") keyed
 * by field path, so the editor can show each next to its field. Issues
 * without a path land under "".
 */
export function groupIssuesByField(issues: readonly string[]): Map<string, string> {
  const byField = new Map<string, string>();
  for (const issue of issues) {
    const separator = issue.indexOf(": ");
    const looksLikePath = separator > 0 && /^[a-zA-Z0-9_.]+$/.test(issue.slice(0, separator));
    const path = looksLikePath ? issue.slice(0, separator) : "";
    const message = looksLikePath ? issue.slice(separator + 2) : issue;
    if (!byField.has(path)) byField.set(path, message);
  }
  return byField;
}

/** Fields the editor shows an issue beside; stage rows show every `stages.N…` issue themselves. */
const PLACED_FIELDS = new Set(["name", "purpose", "shortcut", "constraints", "stages"]);

const FIELD_LABELS: Record<string, string> = {
  startsWhen: "Starts when",
  runtime: "Runs on",
  checkIns: "Check-ins",
  team: "Team",
  advisorReview: "Advisor review",
};

/**
 * Issues without a field of their own in the editor (start conditions,
 * runtime, identity), labelled for the save banner so none goes unshown.
 */
export function listUnplacedIssues(
  byField: ReadonlyMap<string, string>,
): Array<{ path: string; label: string; message: string }> {
  const unplaced: Array<{ path: string; label: string; message: string }> = [];
  for (const [path, message] of byField) {
    if (PLACED_FIELDS.has(path) || path.startsWith("stages.")) continue;
    const root = path.split(".")[0] ?? "";
    unplaced.push({ path, label: FIELD_LABELS[root] ?? (root || "Playbook"), message });
  }
  return unplaced;
}
