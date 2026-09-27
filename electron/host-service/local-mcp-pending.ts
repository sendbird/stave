/**
 * Pending approvals and questions in a task's messages, as the Local MCP task
 * tools and the supervisors report them. Pure.
 */
import { findLatestPendingApprovalPart, findLatestPendingUserInputPart } from "../../src/store/provider-message.utils";
import type { ChatMessage } from "../../src/types/chat";

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
