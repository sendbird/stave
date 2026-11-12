import { z } from "zod";
import type { TarsActionReceipt } from "./conversation";

/** Navigation has no execution or authority payload. Only scoped screens take an id. */
export const TarsOpenActionSchema = z.object({
  kind: z.literal("open"),
  target: z.enum(["task", "workspace", "fleet", "activity"]),
  id: z.string().trim().min(1).max(256).optional(),
}).strict().superRefine((action, context) => {
  if ((action.target === "task" || action.target === "workspace") !== (action.id !== undefined))
    // i18n-ignore: schema diagnostic, never shown as product copy
    context.addIssue({ code: "custom", path: ["id"], message: "Only task and workspace require an id." });
});
export type TarsOpenAction = z.infer<typeof TarsOpenActionSchema>;

/** Initial hydration remembers history; only subsequently admitted receipts navigate, once. */
export function selectNewTarsOpenRequests(receipts: readonly TarsActionReceipt[], seen: ReadonlySet<string> | null) {
  const next = new Set(seen ?? []);
  const requests: TarsOpenAction[] = [];
  for (const receipt of [...receipts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.actionIndex - b.actionIndex)) {
    if (receipt.status !== "applied" || receipt.action.kind !== "open") continue;
    const key = `${receipt.messageId}:${receipt.actionIndex}`;
    if (next.has(key)) continue;
    next.add(key);
    if (seen) requests.push(receipt.action);
  }
  return { requests, seen: next };
}
