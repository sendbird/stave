import { createHash } from "node:crypto";
import type { ApprovalResolvedEvent } from "../../src/lib/approvals/approval-resolution";
import { isRecord } from "./codex-app-server-json";

const ACTION_TOOL_NAMES = {
  command: "bash",
  execve: "bash",
  writeStdin: "bash",
  applyPatch: "apply_patch",
  networkAccess: "network",
  mcpToolCall: "mcp",
  requestPermissions: "permissions",
} as const;
const MAX_DATE_MS = 8_640_000_000_000_000;

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS;
}

function actionToolName(action: Record<string, unknown>): string | null {
  const strings = (...keys: string[]) => keys.every((key) => typeof action[key] === "string");
  const stringArray = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === "string");
  const commandSource = action.source === "shell" || action.source === "unifiedExec";
  let valid = false;
  switch (action.type) {
    case "command": valid = strings("command", "cwd") && commandSource; break;
    case "execve": valid = strings("program", "cwd") && stringArray(action.argv) && commandSource; break;
    case "writeStdin": valid = strings("approvalId", "processId", "stdin", "cwd"); break;
    case "applyPatch": valid = strings("cwd") && stringArray(action.files); break;
    case "networkAccess":
      valid = strings("host", "target") && typeof action.port === "number" && Number.isInteger(action.port) && action.port >= 0 && action.port <= 65_535 &&
        ["http", "https", "socks5Tcp", "socks5Udp"].includes(action.protocol as string);
      break;
    case "mcpToolCall": valid = strings("server", "toolName"); break;
    case "requestPermissions": valid = isRecord(action.permissions); break;
  }
  return valid ? ACTION_TOOL_NAMES[action.type as keyof typeof ACTION_TOOL_NAMES] : null;
}

/**
 * Optional experimental notifications (Codex 0.165.0). Unknown variants are
 * ignored; observing a native decision never answers an approval request.
 */
export function createCodexApprovalReviewTracker(threadId: string) {
  const recorded = new Set<string>();
  return {
    emitCompleted(params: unknown, activeTurnId: string, emit: (event: ApprovalResolvedEvent) => void, aborted: boolean): void {
      if (aborted) return;
      const event = this.completed(params, activeTurnId);
      if (event) emit(event);
    },
    completed(params: unknown, activeTurnId: string): ApprovalResolvedEvent | null {
      if (!isRecord(params) || !activeTurnId || params.threadId !== threadId || params.turnId !== activeTurnId ||
          params.decisionSource !== "agent" || typeof params.reviewId !== "string" || !params.reviewId.trim() ||
          params.reviewId.length > 1_024 || !isRecord(params.review) || !isRecord(params.action)) return null;
      const status = params.review.status;
      if (status !== "approved" && status !== "denied") return null;
      const toolName = actionToolName(params.action);
      if (!toolName) return null;
      if (!isTimestamp(params.startedAtMs) || !isTimestamp(params.completedAtMs) || params.startedAtMs > params.completedAtMs) return null;

      // A target item may have multiple execve/stdin reviews, or no item at all
      // for network access. Review IDs are not user approval request IDs.
      const requestId = `codex-review:${createHash("sha256").update(JSON.stringify([threadId, activeTurnId, params.reviewId])).digest("hex")}`;
      if (recorded.has(requestId)) return null;
      recorded.add(requestId);
      return {
        type: "approval_resolved",
        requestId,
        toolName,
        decision: status === "approved" ? "allowed" : "denied",
        source: "provider-auto",
        reason: "provider-reviewer",
        decidedAt: new Date(params.completedAtMs).toISOString(),
      };
    },
  };
}
