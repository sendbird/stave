import type { TarsDecisionAction } from "./conversation";
import { tarsFinishedSince, type TarsSuggestion, type TarsSuggestionKind } from "./suggestions";
import type { TarsLane } from "./attention";
import type { TarsTrayModel } from "./tray-model";

/**
 * What a request leads to: one of the planner's action kinds
 * (`TarsDecisionActionSchema`), or `reply` for a question Tars answers in
 * words with no action.
 */
export type TarsStartActionKind = TarsDecisionAction["kind"] | "reply";

/** What the examples are grouped by: something the user can ask Tars to do today. */
export type TarsStartGroupId = "delegate" | "schedule" | "steer" | "answer" | "show" | "publish" | "clear";

/** What an example needs before it is offered: a registered repository, or a bridge that can publish, clear or set up schedules. */
export type TarsStartRequirement = "repository" | "publish" | "clear" | "schedule";

export interface TarsStartExample {
  /** The copy key: `tars.start.examples.<id>.label` and `.prompt`. */
  id: "workspace" | "delegate" | "schedule" | "status" | "pause" | "queue" | "answerWaiting" | "options" | "report" | "changes" | "openScreen" | "publish" | "clearConversation" | "clearDone";
  group: TarsStartGroupId;
  action: TarsStartActionKind;
  requires?: TarsStartRequirement;
  /** Suggestion chips that ask the same thing about real work; while one shows, this example is left out. */
  covers?: readonly TarsSuggestionKind[];
}

export const TARS_START_GROUPS: readonly TarsStartGroupId[] = ["delegate", "schedule", "steer", "answer", "show", "publish", "clear"];

/**
 * Every example names the action kind it leads to, so the start screen offers
 * only what the planner can propose. A new kind in the action schema needs an
 * example here before it is advertised (`tests/tars-start.test.ts`).
 */
export const TARS_START_EXAMPLES: readonly TarsStartExample[] = [
  { id: "delegate", group: "delegate", action: "delegate", requires: "repository" },
  { id: "schedule", group: "schedule", action: "schedule", requires: "schedule" },
  { id: "status", group: "steer", action: "reply", covers: ["needsYou"] },
  { id: "pause", group: "steer", action: "control" },
  { id: "workspace", group: "steer", action: "workspace", requires: "repository" },
  { id: "queue", group: "steer", action: "reprioritize" },
  { id: "answerWaiting", group: "answer", action: "control" },
  { id: "options", group: "answer", action: "ask", covers: ["blocked"] },
  { id: "report", group: "show", action: "show", covers: ["report"] },
  { id: "changes", group: "show", action: "show" },
  { id: "openScreen", group: "show", action: "open" },
  { id: "publish", group: "publish", action: "publish", requires: "publish", covers: ["publish"] },
  { id: "clearConversation", group: "clear", action: "clear", requires: "clear" },
  { id: "clearDone", group: "clear", action: "clear", requires: "clear" },
];

export interface TarsStartGroup { id: TarsStartGroupId; examples: TarsStartExample[] }

/**
 * The examples to offer now, by group and in a fixed order. An example is left
 * out when what it needs is missing (no registered repository, a bridge that
 * cannot publish, clear or set up schedules) or when a suggestion chip already asks the same
 * about real work; a group left with none is left out too.
 */
export function buildTarsStartGroups(args: {
  /** How many registered repositories Tars can work in; null when unknown, which hides nothing. */
  repositories: number | null;
  canPublish: boolean;
  canClear: boolean;
  /** Whether the bridge can set up schedules, which also need a registered repository to run in. */
  canSchedule?: boolean;
  /** The chips shown above the composer now. */
  suggestions?: readonly Pick<TarsSuggestion, "kind">[];
}): TarsStartGroup[] {
  const chips = new Set((args.suggestions ?? []).map((entry) => entry.kind));
  const met = (requirement: TarsStartRequirement | undefined) => requirement === undefined
    || (requirement === "repository" ? args.repositories !== 0 : requirement === "publish" ? args.canPublish
      : requirement === "clear" ? args.canClear : Boolean(args.canSchedule) && args.repositories !== 0);
  return TARS_START_GROUPS.map((id) => ({ id, examples: TARS_START_EXAMPLES.filter((example) => example.group === id && met(example.requires)
    && !example.covers?.some((kind) => chips.has(kind))) })).filter((group) => group.examples.length > 0);
}

/** One "Right now" count and where it opens: its tray lane, at the first work it counts when there is one. */
export interface TarsStartCount { kind: "needsYou" | "running" | "finishedToday"; count: number; lane: TarsLane; responsibilityId: string | null }

/**
 * What the work is doing now, from the tray's own model so the start screen
 * and the tray never disagree: what waits on the user, what runs, and what
 * completed in the last day. Counts of zero are left out; before the work was
 * read (`tray` null) nothing is claimed.
 */
export function buildTarsStartCounts(args: { tray: Pick<TarsTrayModel, "lanes" | "counts"> | null; now: string }): TarsStartCount[] {
  const { tray } = args;
  if (!tray) return [];
  const finished = tarsFinishedSince(tray.lanes.done.map((card) => card.row), args.now);
  const counts: TarsStartCount[] = [
    { kind: "needsYou", count: tray.counts.needsYou, lane: "needsYou", responsibilityId: tray.lanes.needsYou[0]?.row.id ?? null },
    { kind: "running", count: tray.counts.running, lane: "running", responsibilityId: null },
    { kind: "finishedToday", count: finished.length, lane: "done", responsibilityId: finished[0]?.id ?? null },
  ];
  return counts.filter((entry) => entry.count > 0);
}

/** How many repository names the start screen lists before "+N more". */
export const TARS_START_REPOSITORIES_MAX = 4;

/**
 * The names of the registered repositories, in registry order, with the open
 * repository added when the registry does not hold it yet. One entry per path.
 */
export function listTarsStartRepositories(args: {
  registered: readonly { repositoryPath: string; repositoryName: string }[];
  current?: { repositoryPath: string | null; repositoryName: string | null };
}): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const add = (path: string | null | undefined, name: string | null | undefined) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    names.push(name?.trim() || path.split(/[\\/]/).filter(Boolean).at(-1) || path);
  };
  for (const repository of args.registered) add(repository.repositoryPath, repository.repositoryName);
  add(args.current?.repositoryPath, args.current?.repositoryName);
  return names;
}
