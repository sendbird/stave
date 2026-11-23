import { z } from "zod";
import { GitPathSchema } from "./schemas";

/** Commit request; selected paths limit the commit to the files chosen in Create PR. */
export const ScmCommitArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    message: z.string(),
    paths: z.array(GitPathSchema).min(1).max(1000).optional(),
  })
  .strict();
