import { z } from "zod";

/**
 * Turns the host provider runtime is still running, and when the host process
 * booted. A turn created before `hostStartedAt` died with the previous host; a
 * turn the host lists must never be started a second time.
 */
export const ProviderLiveTurnsResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    hostStartedAt: z.number().finite().nonnegative(),
    turns: z.array(z.object({
      turnId: z.string().min(1),
      taskId: z.string().min(1).optional(),
      providerId: z.string().min(1),
    })).max(10_000),
  }),
  z.object({ ok: z.literal(false), message: z.string().optional() }),
]);
export type ProviderLiveTurnsResult = z.infer<typeof ProviderLiveTurnsResultSchema>;
export type ProviderLiveTurns = Extract<ProviderLiveTurnsResult, { ok: true }>;

/** Read the host's live turns. Any failure is unreadable (null), never "no turns". */
export async function readProviderLiveTurns(
  read: (() => Promise<unknown>) | undefined,
): Promise<ProviderLiveTurns | null> {
  if (!read) return null;
  try {
    const parsed = ProviderLiveTurnsResultSchema.safeParse(await read());
    return parsed.success && parsed.data.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Whether the host still runs this turn, or any other turn of the same task. */
export function hostRunsTaskTurn(live: ProviderLiveTurns, args: { taskId: string; turnId?: string }): boolean {
  return live.turns.some((turn) => (args.turnId != null && turn.turnId === args.turnId) || turn.taskId === args.taskId);
}
