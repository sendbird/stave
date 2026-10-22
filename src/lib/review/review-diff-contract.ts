import { z } from "zod";

/**
 * The renderer -> main -> host-service contract for Review's diff reads
 * (`scm:review-diff`, `scm:review-file-diff`), shared with the browser dev
 * bridge. The stage and branch scopes read against a base commit; the
 * uncommitted scope against HEAD.
 */
const ShaSchema = z.string().trim().regex(/^[0-9a-f]{7,64}$/i);
const PathSchema = z.string().min(1).max(4096).refine((value) => !value.includes("\0"));

export const ScmReviewBaseSchema = z.discriminatedUnion("kind", [
  /** A stage's start commit. */
  z.object({ kind: z.literal("commit"), sha: ShaSchema }).strict(),
  /** Where the branch left `ref`, the default branch when omitted. */
  z.object({ kind: z.literal("merge-base"), ref: z.string().trim().min(1).max(255).optional() }).strict(),
  z.object({ kind: z.literal("head") }).strict(),
]);
export type ScmReviewBase = z.infer<typeof ScmReviewBaseSchema>;

export const ScmReviewDiffArgsSchema = z.object({
  cwd: z.string().max(4096).optional(),
  base: ScmReviewBaseSchema,
}).strict();
export type ScmReviewDiffArgs = z.infer<typeof ScmReviewDiffArgsSchema>;

export const ScmReviewFileDiffArgsSchema = z.object({
  cwd: z.string().max(4096).optional(),
  baseSha: ShaSchema,
  path: PathSchema,
  oldPath: PathSchema.optional(),
  /** Never added to git, so it has no content at the base. */
  untracked: z.boolean().optional(),
}).strict();
export type ScmReviewFileDiffArgs = z.infer<typeof ScmReviewFileDiffArgsSchema>;

export interface ScmReviewDiffFile {
  path: string;
  oldPath?: string;
  /** Git name-status letter (`M`, `A`, `D`, `R`, `C`, ...). */
  status: string;
  additions: number | null;
  deletions: number | null;
  untracked?: boolean;
}

export interface ScmReviewDiffResult {
  ok: boolean;
  /** The resolved base commit. */
  baseSha: string | null;
  /** The ref the base came from (the default branch for the branch scope), when there is one. */
  baseRef: string | null;
  headSha: string | null;
  files: ScmReviewDiffFile[];
  stderr: string;
}

export interface ScmReviewFileDiffResult {
  ok: boolean;
  oldContent: string;
  newContent: string;
  /** Binary on either side: the content is left out, never sent. */
  binary?: boolean;
  /**
   * Why a file was not opened: it leads outside the workspace (through a
   * link), it changed while being read, or it is over the size bound.
   */
  code?: "outside" | "changed" | "too-large";
  stderr: string;
}
