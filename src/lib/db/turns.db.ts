import { z } from "zod";

const PersistedTurnSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
  providerId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave")]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export type PersistedTurnSummary = z.infer<typeof PersistedTurnSummarySchema>;

function getPersistenceApi() {
  return window.api?.persistence;
}

export async function listTaskTurns(args: {
  workspaceId: string;
  taskId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.listTaskTurns) {
    return [];
  }

  const response = await persistence.listTaskTurns({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list task turns for ${args.taskId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid task turn payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function listLatestWorkspaceTurns(args: {
  workspaceId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.listLatestWorkspaceTurns) {
    return [];
  }

  const response = await persistence.listLatestWorkspaceTurns({
    workspaceId: args.workspaceId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list latest workspace turns for ${args.workspaceId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid latest workspace turn payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function listActiveWorkspaceTurns(args: {
  workspaceId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    return [];
  }

  if (!persistence.listActiveWorkspaceTurns) {
    const latestTurns = await listLatestWorkspaceTurns(args);
    return latestTurns.filter((turn) => !turn.completedAt);
  }

  const response = await persistence.listActiveWorkspaceTurns({
    workspaceId: args.workspaceId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list active workspace turns for ${args.workspaceId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid active workspace turn payload returned from persistence bridge.");
  }

  return parsed.data;
}
