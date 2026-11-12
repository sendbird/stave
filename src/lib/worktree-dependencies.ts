import { z } from "zod";

export const WorktreeDependenciesArgsSchema = z.object({
  sourcePath: z.string().min(1),
  workspacePath: z.string().min(1),
  skipRootNodeModules: z.boolean().optional(),
}).strict();

export type WorktreeDependenciesArgs = z.infer<typeof WorktreeDependenciesArgsSchema>;
export type WorktreeDependenciesResult = { status: "copied" | "skipped" | "fallback" };
