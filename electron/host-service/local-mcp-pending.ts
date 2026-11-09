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

/**
 * Bounded copies of the approvals and questions waiting in a task, oldest
 * first, as Tars shows them to the user and its planner. Text is cut, never
 * interpreted; the answer path reads the task again before responding.
 */
export function describePendingRequests(messages: ChatMessage[], limit: number) {
  const cut = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const requests: Array<{ kind: "approval" | "question"; requestId: string; messageId: string; toolName: string; summary: string;
    questions?: Array<{ key: string; question: string; options: string[] }> }> = [];
  for (const message of messages) {
    const approval = findLatestPendingApprovalPart({ message });
    if (approval) requests.push({ kind: "approval", requestId: approval.requestId, messageId: message.id, toolName: cut(approval.toolName, 120),
      summary: cut([approval.description, approval.input].filter(Boolean).join(" — "), 500) });
    const input = findLatestPendingUserInputPart({ message });
    // The answer key stays whole (the answer path looks it up exactly); a question whose key is too long is answered in the task.
    if (input) requests.push({ kind: "question", requestId: input.requestId, messageId: message.id, toolName: cut(input.toolName, 120),
      summary: cut(input.questions.map((question) => question.question).join(" / "), 500),
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
