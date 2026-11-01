import { deriveTraceToolSummary } from "@/components/session/message/assistant-trace.utils";
import type { ApprovalPart } from "@/types/chat";

export interface ComposerApprovalItem {
  messageId: string;
  part: ApprovalPart;
}

/**
 * Which pending request the composer shows, and where it sits in the queue.
 *
 * The queue leads with the latest request. A person can step to another one;
 * the step names its request, so a request that arrives or is answered
 * meanwhile does not move the row onto a different command. Once the stepped-to
 * request leaves the queue, the row falls back to the lead.
 */
export function resolveShownApproval<T extends ComposerApprovalItem>(
  approvals: readonly T[],
  shownRequestId: string | null | undefined,
): { item: T; index: number } | null {
  if (approvals.length === 0) {
    return null;
  }
  const index = shownRequestId
    ? approvals.findIndex((approval) => approval.part.requestId === shownRequestId)
    : -1;
  const resolvedIndex = index === -1 ? 0 : index;
  return { item: approvals[resolvedIndex]!, index: resolvedIndex };
}

/** The request id one step before or after the shown one, wrapping around. */
export function stepShownApproval(
  approvals: readonly ComposerApprovalItem[],
  shownRequestId: string | null | undefined,
  direction: -1 | 1,
): string | null {
  const shown = resolveShownApproval(approvals, shownRequestId);
  if (!shown) {
    return null;
  }
  const nextIndex = (shown.index + direction + approvals.length) % approvals.length;
  return approvals[nextIndex]!.part.requestId;
}

/**
 * The one line that names what the request would run: the command, file,
 * pattern or URL the tool input carries, then the provider's description, then
 * the raw input. The row truncates it; the details show everything.
 */
export function summarizeApprovalRequest(
  part: Pick<ApprovalPart, "toolName" | "input" | "description">,
): string {
  const input = part.input?.trim() ?? "";
  const summary = input
    ? deriveTraceToolSummary({ toolName: part.toolName, input })
    : null;
  if (summary?.text) {
    return summary.text;
  }
  const description = part.description?.trim();
  if (description) {
    return description.split("\n")[0]!.trim();
  }
  return input.split("\n")[0]?.trim() ?? "";
}
