/**
 * Pending approvals and questions in a task's messages, as the Local MCP task
 * tools and the supervisors report them. Pure.
 */
import { findLatestPendingApprovalPart, findLatestPendingUserInputPart } from "../../src/store/provider-message.utils";
import type { ChatMessage } from "../../src/types/chat";
import type { ApprovalRuleDecider } from "../../src/lib/approvals/approval-resolution";

/** One answer to a tool approval waiting in a task (`respondApproval`). */
export interface HostApprovalArgs {
  workspaceId: string;
  taskId: string;
  requestId: string;
  approved: boolean;
  /** A Stave rule answered (trusted tools, the managed timeout); absent: a person did. */
  decidedBy?: ApprovalRuleDecider;
  /** Tars: the request must still be the one in this message, since a provider may reuse a request id. */
  expectedMessageId?: string;
}

export function findPendingApprovals(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
  }> = [];

  for (const message of messages) {
    const approvalPart = findLatestPendingApprovalPart({ message });
    if (!approvalPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: approvalPart.requestId,
      toolName: approvalPart.toolName,
      description: approvalPart.description,
    });
  }

  return pending;
}

/** The longest approval or question summary Tars keeps (`TarsPendingRequestSchema.summary`). */
export const PENDING_REQUEST_SUMMARY_MAX = 500;
/** Ends a cut summary, so a shortened request never reads as the whole one. */
export const PENDING_REQUEST_TRUNCATION_MARK = "\u2026";

/**
 * An approval's tool description and input, as the user approves them: line
 * breaks kept (a multi-line command must not read as one line), runs of blank
 * lines folded, and cut to `max` characters with the truncation mark. A cut
 * never splits a surrogate pair.
 */
export function boundApprovalSummary(text: string, max = PENDING_REQUEST_SUMMARY_MAX): { summary: string; truncated: boolean } {
  const whole = text.replace(/\r\n?/g, "\n").replace(/[^\S\n]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (whole.length <= max) return { summary: whole, truncated: false };
  let end = max - PENDING_REQUEST_TRUNCATION_MARK.length;
  const last = whole.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { summary: `${whole.slice(0, end).trimEnd()}${PENDING_REQUEST_TRUNCATION_MARK}`, truncated: true };
}

/**
 * Bounded copies of the approvals and questions waiting in a task, oldest
 * first, as Tars shows them to the user and its planner. Text is cut, never
 * interpreted; the answer path reads the task again before responding. A cut
 * approval says so (`truncated`, and its summary ends in the mark), so the
 * card that confirms it can point at the task that shows it whole.
 */
export function describePendingRequests(messages: ChatMessage[], limit: number) {
  const cut = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const requests: Array<{ kind: "approval" | "question"; requestId: string; messageId: string; toolName: string; summary: string; truncated?: true;
    questions?: Array<{ key: string; question: string; options: string[] }> }> = [];
  for (const message of messages) {
    const approval = findLatestPendingApprovalPart({ message });
    if (approval) {
      const { summary, truncated } = boundApprovalSummary([approval.description, approval.input].filter(Boolean).join(" — "));
      requests.push({ kind: "approval", requestId: approval.requestId, messageId: message.id, toolName: cut(approval.toolName, 120), summary,
        ...(truncated ? { truncated: true as const } : {}) });
    }
    const input = findLatestPendingUserInputPart({ message });
    // The answer key stays whole (the answer path looks it up exactly); a question whose key is too long is answered in the task.
    if (input) requests.push({ kind: "question", requestId: input.requestId, messageId: message.id, toolName: cut(input.toolName, 120),
      summary: cut(input.questions.map((question) => question.question).join(" / "), PENDING_REQUEST_SUMMARY_MAX),
      questions: input.questions.slice(0, 12).map((question) => ({ key: question.key ?? question.question, question: cut(question.question, 300),
        options: question.options.slice(0, 8).map((option) => cut(option.label, 120)) })).filter((question) => question.key && question.key.length <= 4_000) });
  }
  return requests.slice(0, limit);
}

export function findPendingUserInputs(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    questionCount: number;
  }> = [];

  for (const message of messages) {
    const userInputPart = findLatestPendingUserInputPart({ message });
    if (!userInputPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: userInputPart.requestId,
      toolName: userInputPart.toolName,
      questionCount: userInputPart.questions.length,
    });
  }

  return pending;
}
