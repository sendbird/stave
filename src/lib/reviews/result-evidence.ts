import { z } from "zod";
import type { ChatMessage, CodeDiffPart } from "@/types/chat";
import { AutoRoutingModelResolutionSchema } from "@/lib/providers/model-resolution";

const MAX_SNAPSHOTS = 20;
const MAX_CONTENT_CHARS = 16_000;
const MAX_SNAPSHOT_CHARS = 64_000;

const ResultFileSnapshotSchema = z.object({
  filePath: z.string().max(2000),
  oldContent: z.string().max(MAX_CONTENT_CHARS),
  newContent: z.string().max(MAX_CONTENT_CHARS),
  status: z.enum(["pending", "accepted", "rejected"]),
  truncated: z.boolean(),
});

export const ResultEvidenceSchema = z.object({
  messageId: z.string().min(1).max(1000),
  providerId: z.string().max(100),
  model: z.string().max(1000),
  modelResolution: AutoRoutingModelResolutionSchema.optional().catch(undefined),
  answer: z.string().max(32_000),
  answerTruncated: z.boolean(),
  files: z.array(z.string().max(2000)).max(100),
  filesTruncated: z.boolean(),
  // Optional so older saved results remain readable without invented evidence.
  snapshots: z
    .array(ResultFileSnapshotSchema)
    .max(MAX_SNAPSHOTS)
    .refine(
      (rows) =>
        rows.reduce(
          (total, row) => total + row.oldContent.length + row.newContent.length,
          0,
        ) <= MAX_SNAPSHOT_CHARS,
    )
    .optional(),
  snapshotsTruncated: z.boolean().optional(),
});
export type ResultEvidence = z.infer<typeof ResultEvidenceSchema>;

/** Freeze a bounded, user-visible result at the terminal event, never raw tool arguments. */
export function captureResultEvidence(
  messages: readonly ChatMessage[],
  turnId: string,
): ResultEvidence | undefined {
  let message: ChatMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (
      messages[index]?.role === "assistant" &&
      messages[index]?.turnId === turnId
    ) {
      message = messages[index];
      break;
    }
  }
  if (!message) return undefined;
  const text =
    message.content ||
    message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
  const files = new Set<string>();
  const latestChanges = new Map<string, CodeDiffPart>();
  let filesTruncated = false;
  let modelResolution: ResultEvidence["modelResolution"];
  // A plan, a steer, or a continuation can split one execution across rows.
  // Collect only this execution's files and keep the snapshot allocation bounded.
  for (const row of messages) {
    if (row.role !== "assistant" || row.turnId !== turnId) continue;
    const resolution = AutoRoutingModelResolutionSchema.safeParse(
      row.modelResolution,
    );
    if (resolution.success) modelResolution = resolution.data;
    for (const part of row.parts) {
      if (part.type !== "code_diff") continue;
      if (latestChanges.has(part.filePath)) {
        latestChanges.set(part.filePath, part);
        continue;
      }
      if (files.size >= 100) {
        filesTruncated = true;
        continue;
      }
      files.add(part.filePath.slice(0, 2000));
      if (part.filePath.length > 2000) filesTruncated = true;
      else latestChanges.set(part.filePath, part);
    }
  }
  const snapshots: z.infer<typeof ResultFileSnapshotSchema>[] = [];
  let remaining = MAX_SNAPSHOT_CHARS;
  for (const part of latestChanges.values()) {
    if (snapshots.length >= MAX_SNAPSHOTS || remaining === 0) break;
    // Reserve space for both sides; a large baseline must not consume the new side.
    const sideBudget = Math.min(MAX_CONTENT_CHARS, Math.floor(remaining / 2));
    const oldContent = part.oldContent.slice(0, sideBudget);
    const newContent = part.newContent.slice(0, sideBudget);
    snapshots.push({
      filePath: part.filePath,
      oldContent,
      newContent,
      status: part.status,
      truncated:
        oldContent.length < part.oldContent.length ||
        newContent.length < part.newContent.length,
    });
    remaining -= oldContent.length + newContent.length;
  }
  return {
    messageId: message.id,
    providerId: message.providerId,
    model: message.model,
    ...(modelResolution ? { modelResolution } : {}),
    answer: text.slice(0, 32_000),
    answerTruncated: text.length > 32_000,
    files: [...files],
    filesTruncated,
    snapshots,
    snapshotsTruncated:
      filesTruncated ||
      snapshots.length < latestChanges.size ||
      snapshots.some((row) => row.truncated),
  };
}
