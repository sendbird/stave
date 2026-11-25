import { z } from "zod";

/**
 * Stacked pull requests: a PR whose base is another PR's head branch.
 *
 * Long-lived integration branches (the default branch, `develop`,
 * `release/*`, `staging` and the like) also receive PRs from their own head,
 * so a branch name alone never makes a parent. A PR counts as a parent only
 * when it is open, or merged after its child was opened; its head is in this
 * repository; and its head branch is not long-lived (see
 * `isLongLivedParentHead`). Retargeting touches only the viewer's own
 * same-repository children, after the user confirmed the exact list.
 */
export const DEFAULT_LONG_LIVED_BRANCH_PATTERNS = ["main", "master", "develop", "staging", "release/*"] as const;

const BranchSchema = z.string().trim().min(1).max(300).refine(value => !value.startsWith("-") && !/[\s~^:?*[\\]/.test(value), "Invalid branch name");
const PullRequestUrlSchema = z.string().max(2000).url().regex(/^https:\/\/[a-z0-9.-]+\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/i);
/** Branch names with `*` as the only wildcard. */
export const LongLivedBranchPatternSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._/*-]+$/);
export const LongLivedBranchPatternsSchema = z.array(LongLivedBranchPatternSchema).max(32);

export const StackPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(1000),
  url: z.string().url().max(2000),
  headRefName: BranchSchema,
  baseRefName: BranchSchema,
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  createdAt: z.string().datetime(),
  mergedAt: z.string().datetime().nullable(),
  /** GitHub login of the author. */
  author: z.string().max(200),
  /** The head branch lives in this repository, not a fork. */
  sameRepository: z.boolean(),
}).strict();
export type StackPr = z.infer<typeof StackPrSchema>;

export const STACK_EXCLUSION_REASONS = ["not-yours", "fork"] as const;
export const RetargetPlanSchema = z.object({
  /** The merged parent whose children still target its head branch. */
  parent: StackPrSchema,
  toBase: BranchSchema,
  /** The viewer's own same-repository children: the only ones Stave may change. */
  children: z.array(StackPrSchema).max(32),
  /** Children Stave lists but never changes. */
  excluded: z.array(z.object({ pr: StackPrSchema, reason: z.enum(STACK_EXCLUSION_REASONS) }).strict()).max(32),
}).strict();
export type RetargetPlan = z.infer<typeof RetargetPlanSchema>;

export const PullRequestStackSchema = z.object({
  current: z.number().int().positive(),
  position: z.number().int().positive(),
  total: z.number().int().positive().max(32),
  parent: StackPrSchema.nullable(),
  children: z.array(StackPrSchema).max(32),
  members: z.array(StackPrSchema).max(32),
  retarget: RetargetPlanSchema.nullable(),
}).strict();
export type PullRequestStack = z.infer<typeof PullRequestStackSchema>;

/** Host failures travel as codes; the renderer translates them. */
export const STACK_ERROR_CODES = ["auth", "read-failed", "parent-ineligible", "parent-not-merged", "invalid-response"] as const;
export type StackErrorCode = (typeof STACK_ERROR_CODES)[number];
export const RETARGET_SKIP_REASONS = ["not-yours", "fork", "not-open", "base-changed", "target-changed", "not-a-child", "read-failed", "edit-failed", "merge-conflict", "update-failed"] as const;
export type RetargetReason = (typeof RETARGET_SKIP_REASONS)[number];

export const GetPrStackArgsSchema = z.object({
  cwd: z.string().min(1).max(4096).optional(),
  branch: BranchSchema.optional(),
  prUrl: PullRequestUrlSchema.optional(),
  longLivedBranchPatterns: LongLivedBranchPatternsSchema.optional(),
}).strict();
export type GetPrStackArgs = z.infer<typeof GetPrStackArgsSchema>;
export const GetPrStackResultSchema = z.object({ ok: z.boolean(), stack: PullRequestStackSchema.nullable(), code: z.enum(STACK_ERROR_CODES).nullable() }).strict();
export type GetPrStackResult = z.infer<typeof GetPrStackResultSchema>;

export const RetargetChildSchema = z.object({ number: z.number().int().positive(), fromBase: BranchSchema, toBase: BranchSchema }).strict();
export const RetargetPrStackArgsSchema = z.object({
  cwd: z.string().min(1).max(4096).optional(),
  parentNumber: z.number().int().positive(),
  parentUrl: PullRequestUrlSchema.optional(),
  /** Exactly the transitions the user confirmed. Anything that changed since is skipped. */
  children: z.array(RetargetChildSchema).min(1).max(32),
  longLivedBranchPatterns: LongLivedBranchPatternsSchema.optional(),
}).strict();
export type RetargetPrStackArgs = z.infer<typeof RetargetPrStackArgsSchema>;
export const RetargetChildResultSchema = z.object({
  number: z.number().int().positive(),
  status: z.enum(["updated", "conflict", "skipped"]),
  reason: z.enum(RETARGET_SKIP_REASONS).nullable(),
}).strict();
export type RetargetChildResult = z.infer<typeof RetargetChildResultSchema>;
export const RetargetPrStackResultSchema = z.object({
  ok: z.boolean(),
  code: z.enum(STACK_ERROR_CODES).nullable(),
  results: z.array(RetargetChildResultSchema).max(32),
}).strict();
export type RetargetPrStackResult = z.infer<typeof RetargetPrStackResultSchema>;

function patternToRegExp(pattern: string) {
  return new RegExp(`^${pattern.split("*").map(part => part.replace(/[.+?^${}()|[\]\\/-]/g, "\\$&")).join(".*")}$`);
}

/** The settings text: names or `*` globs separated by commas or lines. Invalid entries are dropped. */
export function parseLongLivedBranchPatterns(text: string | undefined) {
  if (text === undefined) return [...DEFAULT_LONG_LIVED_BRANCH_PATTERNS];
  return text.split(/[,\n]/).map(value => value.trim()).filter(value => LongLivedBranchPatternSchema.safeParse(value).success).slice(0, 32);
}

export const DEFAULT_LONG_LIVED_BRANCHES_TEXT = DEFAULT_LONG_LIVED_BRANCH_PATTERNS.join(", ");

export function isLongLivedBranchName(branch: string, patterns: readonly string[]) {
  return patterns.some(pattern => patternToRegExp(pattern).test(branch));
}

export interface StackContext {
  defaultBranch: string;
  viewer: string;
  longLivedBranchPatterns: readonly string[];
}

/**
 * A head branch that is the default branch, matches a long-lived pattern, or
 * already served as the base of open PRs older than this one is an
 * integration branch, not a stack parent.
 */
export function isLongLivedParentHead(parent: StackPr, prs: readonly StackPr[], context: StackContext) {
  if (parent.headRefName === context.defaultBranch || isLongLivedBranchName(parent.headRefName, context.longLivedBranchPatterns)) return true;
  const created = Date.parse(parent.createdAt);
  return prs.some(other => other.state === "OPEN" && other.number !== parent.number && other.baseRefName === parent.headRefName && Date.parse(other.createdAt) < created);
}

/** Whether `parent` is a stack parent of `child` under the rules above. */
export function isStackParent(parent: StackPr, child: StackPr, prs: readonly StackPr[], context: StackContext) {
  if (parent.number === child.number || parent.headRefName !== child.baseRefName || !parent.sameRepository) return false;
  if (parent.state === "CLOSED") return false;
  if (parent.state === "MERGED" && !(parent.mergedAt && Date.parse(parent.mergedAt) > Date.parse(child.createdAt))) return false;
  return !isLongLivedParentHead(parent, prs, context);
}

export function stackParentOf(child: StackPr, prs: readonly StackPr[], context: StackContext) {
  if (child.baseRefName === context.defaultBranch) return null;
  const candidates = prs.filter(candidate => isStackParent(candidate, child, prs, context));
  return candidates.find(candidate => candidate.state === "OPEN")
    ?? candidates.filter(candidate => candidate.state === "MERGED").sort((a, b) => Date.parse(b.mergedAt!) - Date.parse(a.mergedAt!))[0]
    ?? null;
}

function exclusionOf(pr: StackPr, viewer: string): RetargetPlan["excluded"][number]["reason"] | null {
  if (!pr.sameRepository) return "fork";
  return pr.author.toLowerCase() === viewer.toLowerCase() ? null : "not-yours";
}

/** Open children of a merged parent, split into the viewer's own and the rest. */
export function buildRetargetPlan(parent: StackPr, prs: readonly StackPr[], context: StackContext): RetargetPlan | null {
  if (parent.state !== "MERGED") return null;
  const children = prs.filter(child => child.state === "OPEN" && isStackParent(parent, child, prs, context)).sort((a, b) => a.number - b.number);
  if (!children.length) return null;
  const plan: RetargetPlan = { parent, toBase: parent.baseRefName, children: [], excluded: [] };
  for (const child of children) {
    const reason = exclusionOf(child, context.viewer);
    if (reason) plan.excluded.push({ pr: child, reason });
    else plan.children.push(child);
  }
  return plan;
}

/** Topological order keeps a parent's position before every dependent child. */
export function buildPullRequestStack(current: number, prs: readonly StackPr[], context: StackContext): PullRequestStack | null {
  const selected = prs.find(pr => pr.number === current);
  if (!selected) return null;
  let root = selected;
  const ancestors = new Set<number>();
  for (;;) {
    if (ancestors.has(root.number)) return null;
    ancestors.add(root.number);
    const parent = stackParentOf(root, prs, context);
    if (!parent) break;
    root = parent;
  }
  // Ancestors and the current PR always belong; other children only when the
  // viewer could act on them.
  const belongs = (pr: StackPr) => ancestors.has(pr.number) || exclusionOf(pr, context.viewer) === null;
  const members: StackPr[] = [];
  const visit = (pr: StackPr) => {
    if (members.some(member => member.number === pr.number) || members.length >= 32) return;
    members.push(pr);
    prs.filter(child => child.state === "OPEN" && belongs(child) && isStackParent(pr, child, prs, context))
      .sort((a, b) => a.number - b.number).forEach(visit);
  };
  visit(root);
  const mergedParent = selected.state === "MERGED" ? selected : null;
  const parent = stackParentOf(selected, prs, context);
  const retarget = buildRetargetPlan(mergedParent ?? parent ?? selected, prs, context);
  if (members.length < 2 && !retarget) return null;
  const position = members.findIndex(pr => pr.number === current) + 1;
  if (!position) return null;
  return {
    current, position, total: members.length, parent,
    children: members.filter(pr => pr.number !== selected.number && isStackParent(selected, pr, prs, context)),
    members, retarget,
  };
}
