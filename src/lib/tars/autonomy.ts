import { z } from "zod";
import type { TarsControlOperation } from "./types";

/**
 * How independently Tars acts, as one choice. The host reads this table when
 * it admits a decision, the planner is told its result, and Settings shows it,
 * so the three cannot drift.
 *
 * - `careful`: every action that starts or reorders work waits for Confirm.
 * - `balanced`: the default; exactly what Tars did before levels existed.
 * - `handsOff`: reversible run controls the user asked for in their own words
 *   apply at once and leave their record.
 *
 * No level loosens a guard: effects that cannot be undone and publishing wait
 * for the user at every level, and an automatic follow-up never gains anything
 * from a level (`tarsActionMode`).
 */
export const TARS_AUTONOMY_LEVELS = ["careful", "balanced", "handsOff"] as const;
export const TarsAutonomyLevelSchema = z.enum(TARS_AUTONOMY_LEVELS);
export type TarsAutonomyLevel = z.infer<typeof TarsAutonomyLevelSchema>;
/** An absent level (profiles saved before levels existed) is this one. */
export const TARS_DEFAULT_AUTONOMY: TarsAutonomyLevel = "balanced";

export const TARS_NEVER_RULES_MAX = 12;
export const TARS_NEVER_RULE_MAX_CHARS = 200;
/** The user's own "never do" rules, in plain language. Guidance for Tars and a reason to ask first; not a technical block. */
export const TarsNeverRulesSchema = z.array(z.string().trim().min(1).max(TARS_NEVER_RULE_MAX_CHARS)).max(TARS_NEVER_RULES_MAX)
  // i18n-ignore: schema diagnostic, not user-facing copy
  .refine((rules) => new Set(rules.map((rule) => rule.toLocaleLowerCase())).size === rules.length, "Each rule is listed once.");

/**
 * Controls that return authority to Tars, give its run more room or end work.
 * At the default level a model-proposed one waits for the user's confirming
 * click; pause and takeover, which only reduce Tars's authority, apply at
 * once, and so does `startNow`, which only changes when work the user already
 * admitted starts.
 */
export const TARS_CONFIRMED_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set([
  "resume", "handBack", "cancel", "acceptCompletion", "extend", "retryStage", "skipStage", "signOff",
  // Answering for the user in the task: the card shows the exact request, answers or words first.
  "approve", "answer", "message", "requestChanges",
]);
/**
 * Effects that cannot be undone. They are never a default: no recommended
 * option, no Enter, no "yes". An approved tool call runs at once.
 */
export const TARS_IRREVERSIBLE_OPERATIONS: ReadonlySet<TarsControlOperation> = new Set(["cancel", "acceptCompletion", "skipStage", "approve"]);

/** Every act Tars can propose, by the name the policy table and Settings use. A question (`ask`) is never an act. */
export const TARS_ACTION_KEYS = [
  "show", "workspaceEdit", "workspaceReplace",
  "delegate", "reprioritize", "startNow", "pause", "takeover", "deny",
  "resume", "extend", "retryStage", "handBack", "signOff", "answer", "message", "requestChanges", "clear",
  "cancel", "skipStage", "acceptCompletion", "approve", "publish",
] as const;
export type TarsActionKey = (typeof TARS_ACTION_KEYS)[number];

/** `auto`: the host applies it when Tars proposes it. `confirm`: it waits for the user on a card. */
export type TarsActionMode = "auto" | "confirm";
/** Whose message proposed the action: the user's own words (or their chosen answer), or a follow-up Tars started by itself. */
export type TarsActionOrigin = "user" | "automatic";

/** Wait for the user at every level: they cannot be undone, or they leave the machine. */
export const TARS_ALWAYS_CONFIRMED: ReadonlySet<TarsActionKey> = new Set([...TARS_IRREVERSIBLE_OPERATIONS, "publish"]);
/** `careful` adds a confirmation to these, which the default applies at once. */
const CAREFUL_CONFIRMED: ReadonlySet<TarsActionKey> = new Set(["delegate", "reprioritize", "startNow", "workspaceReplace"]);
/** `handsOff` applies these at once: each only lets a run Tars already holds continue, and pause stops it again. */
const HANDS_OFF_APPLIED: ReadonlySet<TarsActionKey> = new Set(["resume", "extend", "retryStage"]);
/** Only reduce what Tars does (or refuse a tool request): never delayed, at any level or for any rule. */
const TARS_REDUCING: ReadonlySet<TarsActionKey> = new Set(["pause", "takeover", "deny"]);

function defaultMode(key: TarsActionKey): TarsActionMode {
  if (key === "publish" || key === "clear") return "confirm";
  if (key === "workspaceEdit" || key === "workspaceReplace") return "auto";
  if (key === "show" || key === "delegate" || key === "reprioritize") return "auto";
  return TARS_CONFIRMED_OPERATIONS.has(key) ? "confirm" : "auto";
}

/**
 * Whether the host applies a proposed action at once or holds it for the
 * user. The guards are checked here, not left to the table: an always-confirmed
 * action is `confirm` whatever the level says, an unknown level is the default,
 * and an automatic follow-up never gets `auto` for anything the default confirms.
 */
export function tarsActionMode(key: TarsActionKey, level: TarsAutonomyLevel | null | undefined, origin: TarsActionOrigin = "user"): TarsActionMode {
  const chosen = TarsAutonomyLevelSchema.safeParse(level).success ? level! : TARS_DEFAULT_AUTONOMY;
  if (TARS_ALWAYS_CONFIRMED.has(key)) return "confirm";
  if (defaultMode(key) === "confirm") return chosen === "handsOff" && origin === "user" && HANDS_OFF_APPLIED.has(key) ? "auto" : "confirm";
  return chosen === "careful" && CAREFUL_CONFIRMED.has(key) ? "confirm" : "auto";
}

/** The policy key of a decision action; null for a question, which is never applied by itself. */
export function tarsActionKey(action: { kind: string; operation?: string }): TarsActionKey | null {
  if (action.kind === "workspace") return ["replaceNotes", "removeTodo", "removeField", "removeResource"].includes(action.operation ?? "") ? "workspaceReplace" : "workspaceEdit";
  if (action.kind === "control") return (action.operation ?? null) as TarsControlOperation | null;
  return action.kind === "ask" ? null : (TARS_ACTION_KEYS as readonly string[]).includes(action.kind) ? action.kind as TarsActionKey : null;
}

const ORDER: Readonly<Record<TarsAutonomyLevel, number>> = { careful: 0, balanced: 1, handsOff: 2 };

/**
 * The level one decision is admitted at: the more careful of the level saved
 * now and the level copied into the message when it was sent. Lowering the
 * level takes effect at once, and a message can never carry a looser level
 * than the settings hold.
 */
export function tarsEffectiveAutonomy(saved: TarsAutonomyLevel | null | undefined, message: TarsAutonomyLevel | null | undefined): TarsAutonomyLevel {
  const levels = [saved ?? TARS_DEFAULT_AUTONOMY, message ?? TARS_DEFAULT_AUTONOMY];
  return levels.reduce((left, right) => ORDER[left] <= ORDER[right] ? left : right);
}

/** What Stave offers no action for, so Tars cannot do it at any level. */
export const TARS_UNAVAILABLE_ACTIONS = ["merge", "deploy", "forcePush", "deleteBranches", "alwaysAllow", "spendMoney", "contactOthers"] as const;
export type TarsUnavailableAction = (typeof TARS_UNAVAILABLE_ACTIONS)[number];

/** What Settings shows for a level: read from `tarsActionMode`, the same function the host admits with. */
export function tarsAutonomySummary(level: TarsAutonomyLevel): { auto: TarsActionKey[]; confirm: TarsActionKey[]; never: readonly TarsUnavailableAction[] } {
  return {
    auto: TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, level) === "auto"),
    confirm: TARS_ACTION_KEYS.filter((key) => tarsActionMode(key, level) === "confirm"),
    never: TARS_UNAVAILABLE_ACTIONS,
  };
}

/** Words a rule may use for an action, in the two interface languages. Matched as whole words. */
// i18n-ignore: matching vocabulary for the user's own rules, never rendered
const ACTION_WORDS: Readonly<Partial<Record<TarsActionKey, readonly string[]>>> = {
  workspaceEdit: ["notes", "todo", "field", "resource", "메모", "할 일", "필드", "자료"],
  workspaceReplace: ["replace", "remove", "notes", "todo", "field", "resource", "삭제", "메모", "할 일", "필드", "자료"],
  delegate: ["delegate", "new work", "start work", "위임", "새 작업"],
  reprioritize: ["priority", "reprioritize", "reorder", "우선순위"],
  startNow: ["start now", "바로 시작", "바로 실행"],
  resume: ["resume", "재개"],
  extend: ["extend", "more turns", "more steps"],
  retryStage: ["retry", "재시도"],
  handBack: ["hand back", "돌려"],
  signOff: ["sign off", "sign-off", "사인오프"],
  answer: ["answer", "답변"],
  message: ["message", "메시지"],
  requestChanges: ["request changes", "변경 요청"],
  clear: ["clear", "지우", "정리"],
  cancel: ["cancel", "취소"],
  skipStage: ["skip", "건너뛰"],
  acceptCompletion: ["accept", "완료 처리"],
  approve: ["approve", "approval", "승인"],
  publish: ["publish", "pull request", "pr", "push", "commit", "푸시", "커밋", "게시"],
};

/** Why a rule matched: it names the action, the repository or a branch of the target. */
export const TarsNeverRuleMatchSchema = z.object({
  rule: z.string().min(1).max(TARS_NEVER_RULE_MAX_CHARS),
  why: z.enum(["action", "repository", "branch"]),
  /** The word of the rule that matched: the action word, the repository's name or the branch. */
  value: z.string().min(1).max(300),
}).strict();
export type TarsNeverRuleMatch = z.infer<typeof TarsNeverRuleMatchSchema>;

export interface TarsNeverRuleSubject {
  key: TarsActionKey;
  /** The repository's folder name. */
  repository?: string | null;
  branches?: ReadonlyArray<string | null | undefined>;
}

/** Whether `text` holds `word` as a whole word: not inside a longer ASCII word, so `main` never matches `domain`. */
function mentions(text: string, word: string) {
  const needle = word.trim().toLocaleLowerCase();
  if (needle.length < 2) return false;
  for (let from = text.indexOf(needle); from !== -1; from = text.indexOf(needle, from + 1)) {
    const before = text[from - 1];
    const after = text[from + needle.length];
    if (!(before && /[a-z0-9]/.test(before)) && !(after && /[a-z0-9]/.test(after))) return true;
  }
  return false;
}

/**
 * The rules that plainly concern a proposed action: a rule matches when its
 * text names the action, the target repository or one of its branches as a
 * whole word. Nothing is inferred beyond those words, so every match can be
 * explained on the card by the word that caused it. One match per rule.
 */
export function matchTarsNeverRules(rules: readonly string[] | null | undefined, subject: TarsNeverRuleSubject): TarsNeverRuleMatch[] {
  const branches = [...new Set((subject.branches ?? []).filter((branch): branch is string => Boolean(branch?.trim())))];
  return (rules ?? []).flatMap((rule): TarsNeverRuleMatch[] => {
    const text = rule.toLocaleLowerCase();
    const repository = subject.repository && mentions(text, subject.repository) ? subject.repository : null;
    if (repository) return [{ rule, why: "repository", value: repository }];
    const branch = branches.find((candidate) => mentions(text, candidate));
    if (branch) return [{ rule, why: "branch", value: branch }];
    const word = (ACTION_WORDS[subject.key] ?? []).find((candidate) => mentions(text, candidate));
    return word ? [{ rule, why: "action", value: word }] : [];
  });
}

/**
 * The host's verdict for one proposed action: its level's mode, tightened to
 * `confirm` when one of the user's rules matches. A rule only ever adds a
 * confirmation; it never delays an action that reduces what Tars does.
 */
export function tarsActionDisposition(args: { key: TarsActionKey; level: TarsAutonomyLevel | null | undefined; origin?: TarsActionOrigin; matches?: readonly TarsNeverRuleMatch[] }): TarsActionMode {
  const mode = tarsActionMode(args.key, args.level, args.origin);
  return mode === "auto" && args.matches?.length && !TARS_REDUCING.has(args.key) && args.key !== "show" ? "confirm" : mode;
}

/** The folder name a repository path ends in, as rules and cards name it. */
export function tarsRepositoryName(repositoryPath: string | null | undefined): string | null {
  return repositoryPath ? repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? null : null;
}
