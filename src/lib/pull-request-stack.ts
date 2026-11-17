import { z } from "zod";

const BranchSchema = z.string().trim().min(1).max(300).refine(value => !value.startsWith("-") && !/[\s~^:?*[\\]/.test(value), "Invalid branch name");
export const StackPrSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(1000),
  url: z.string().url().max(2000),
  headRefName: BranchSchema,
  baseRefName: BranchSchema,
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
}).strict();
export type StackPr = z.infer<typeof StackPrSchema>;
export const PullRequestStackSchema = z.object({
  current: z.number().int().positive(),
  position: z.number().int().positive(),
  total: z.number().int().positive().max(32),
  parent: StackPrSchema.nullable(),
  children: z.array(StackPrSchema).max(32),
  members: z.array(StackPrSchema).max(32),
}).strict();
export type PullRequestStack = z.infer<typeof PullRequestStackSchema>;
export const GetPrStackArgsSchema = z.object({ cwd: z.string().min(1).max(4096).optional(), branch: BranchSchema.optional() }).strict();
export type GetPrStackArgs = z.infer<typeof GetPrStackArgsSchema>;
export const GetPrStackResultSchema = z.object({ ok: z.boolean(), stack: PullRequestStackSchema.nullable(), stderr: z.string() }).strict();
export type GetPrStackResult = z.infer<typeof GetPrStackResultSchema>;
export const RetargetPrStackArgsSchema = z.object({
  cwd: z.string().min(1).max(4096).optional(),
  parentNumber: z.number().int().positive(),
  childNumbers: z.array(z.number().int().positive()).min(1).max(32),
}).strict();
export type RetargetPrStackArgs = z.infer<typeof RetargetPrStackArgsSchema>;
export const RetargetPrStackResultSchema = z.object({ ok: z.boolean(), updated: z.array(z.number().int().positive()).max(32), stderr: z.string() }).strict();
export type RetargetPrStackResult = z.infer<typeof RetargetPrStackResultSchema>;

/** Topological order keeps a parent's position before every dependent child. */
export function buildPullRequestStack(current: number, prs: readonly StackPr[], defaultBranch: string): PullRequestStack | null {
  const selected = prs.find(pr => pr.number === current);
  if (!selected) return null;
  const parentOf = (pr: StackPr) => pr.baseRefName === defaultBranch ? null : prs.find(candidate => candidate.headRefName === pr.baseRefName && candidate.number !== pr.number && candidate.state !== "CLOSED") ?? null;
  let root = selected;
  const ancestors = new Set<number>();
  for (;;) {
    if (ancestors.has(root.number)) return null;
    ancestors.add(root.number);
    const parent = parentOf(root);
    if (!parent) break;
    root = parent;
  }
  const members: StackPr[] = [];
  const visit = (pr: StackPr) => {
    if (members.some(member => member.number === pr.number) || members.length >= 32) return;
    members.push(pr);
    prs.filter(child => child.state === "OPEN" && child.baseRefName === pr.headRefName && child.number !== pr.number)
      .sort((a, b) => a.number - b.number).forEach(visit);
  };
  visit(root);
  if (members.length < 2) return null;
  const position = members.findIndex(pr => pr.number === current) + 1;
  if (!position) return null;
  return { current, position, total: members.length, parent: parentOf(selected), children: members.filter(pr => pr.baseRefName === selected.headRefName && pr.number !== selected.number), members };
}
