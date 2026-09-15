import { z } from "zod";

export const WorkspaceExecutionArgsSchema = z.object({
  workspaceId: z.string().min(1).max(500),
  workspacePath: z.string().min(1).max(4096),
  action: z.enum(["stop", "resume"]),
}).strict();
export type WorkspaceExecutionArgs = z.infer<typeof WorkspaceExecutionArgsSchema>;
export type WorkspaceExecutionState = { workspaceId: string; stopping: boolean; failed?: boolean };
export type WorkspaceExecutionResult = {
  ok: boolean;
  states: WorkspaceExecutionState[];
  message?: string;
};
