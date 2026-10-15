import { i18n } from "../../src/i18n/runtime";
import type { WorkspaceSessionState } from "../../src/store/workspace-session-state";
import { AgentRunCommandError } from "../../src/lib/agent-runs/domain";
import { applyUserInputState } from "../../src/store/editor.utils";
import { findPendingUserInputMessageByRequestId } from "../../src/store/provider-message.utils";
import { runQuestionStage } from "../../src/lib/agent-runs/persistent-question";
import type { UserInputPart } from "../../src/types/chat";
import { answerRunQuestion } from "./run-question-answer";

export interface HostUserInputArgs {
  workspaceId: string; taskId: string; requestId: string;
  answers?: Record<string, string>; denied?: boolean; answerDelivered?: boolean;
}

export interface HostUserInputPorts {
  workspaceName: string;
  enqueue: <T>(key: string, operation: () => Promise<T>) => Promise<T>;
  load: (workspaceId: string, taskId: string) => Promise<WorkspaceSessionState>;
  respond: (args: { turnId: string; requestId: string; answers?: Record<string, string>; denied?: boolean }) => Promise<{ ok: boolean; message?: string }>;
  cache: (workspaceId: string, session: WorkspaceSessionState) => WorkspaceSessionState;
  persist: (args: { workspaceId: string; workspaceName: string; session: WorkspaceSessionState }) => Promise<unknown>;
}

export async function respondHostUserInput(args: HostUserInputArgs, ports: HostUserInputPorts) {
  const result = { ok: true, workspaceId: args.workspaceId, taskId: args.taskId, requestId: args.requestId, denied: args.denied === true };
  const runQuestion = await ports.enqueue(args.workspaceId, async (): Promise<UserInputPart | null> => {
    const session = await ports.load(args.workspaceId, args.taskId);
    const activeTurnId = session.activeTurnIdsByTask[args.taskId];

    const messages = session.messagesByTask[args.taskId] ?? [];
    let userInput = findPendingUserInputMessageByRequestId({
      messages,
      requestId: args.requestId,
    });
    if (!userInput) {
      throw new Error(`Pending user input not found: ${args.requestId}`);
    }

    if (!activeTurnId && runQuestionStage(args.requestId) && userInput.part.delivery !== "async") {
      userInput = { ...userInput, part: { ...userInput.part, delivery: "async" } };
    }
    // A run's saved question is answered by a reply turn of its run. That
    // waits on the run's own queue, so it runs after this queue is released:
    // the workspace's other events must not wait behind another run's work.
    if (userInput.part.delivery === "async" && runQuestionStage(args.requestId)) {
      if (activeTurnId) throw new Error(i18n.t("agentRuns:persistentQuestion.waitForTurn"));
      return userInput.part;
    }
    // An async question has no pending provider request; only a user message
    // delivers its answer. Recording it without one would drop the answer.
    if (userInput.part.delivery === "async" && !args.answerDelivered) {
      throw new Error(`Question ${args.requestId} did not pause the task. Send the answer as a follow-up message to the task instead.`);
    }
    if (userInput.part.delivery !== "async") {
      if (!activeTurnId) throw new Error(`No active turn found for task ${args.taskId}.`);
      const result = await ports.respond({
        turnId: activeTurnId,
        requestId: args.requestId,
        answers: args.answers,
        denied: args.denied,
      });
      if (!result.ok) throw new Error(result.message);
    }
    const nextMessagesState = applyUserInputState({
      messagesByTask: session.messagesByTask,
      workspaceSnapshotVersion: 0,
      taskId: args.taskId,
      messageId: userInput.messageId,
      requestId: args.requestId,
      answers: args.answers,
      denied: args.denied,
    });
    await persistMessages(args, ports, session, nextMessagesState.messagesByTask);
    return null;
  });
  if (!runQuestion) return result;
  try {
    // The reply turn marks the card answered together with the reply message.
    await answerRunQuestion({ ...args, part: runQuestion });
  } catch (error) {
    if (error instanceof AgentRunCommandError && error.code === "not-active") await endMootRunQuestion(args, ports);
    throw error;
  }
  return result;
}

/** The question's run or stage is gone: the card ends so the task stops asking for an answer. */
async function endMootRunQuestion(args: HostUserInputArgs, ports: HostUserInputPorts) {
  await ports.enqueue(args.workspaceId, async () => {
    const session = await ports.load(args.workspaceId, args.taskId);
    const messages = session.messagesByTask[args.taskId] ?? [];
    const pending = findPendingUserInputMessageByRequestId({ messages, requestId: args.requestId });
    if (!pending) return;
    const nextMessages = messages.map((message) => message.id !== pending.messageId ? message : {
      ...message,
      parts: message.parts.map((part) => part.type === "user_input" && part.requestId === args.requestId ? { ...part, state: "input-interrupted" as const } : part),
    });
    await persistMessages(args, ports, session, { ...session.messagesByTask, [args.taskId]: nextMessages });
  });
}

async function persistMessages(args: HostUserInputArgs, ports: HostUserInputPorts, session: WorkspaceSessionState, messagesByTask: WorkspaceSessionState["messagesByTask"]) {
  const nextSession = ports.cache(args.workspaceId, { ...session, messagesByTask });
  await ports.persist({ workspaceId: args.workspaceId, workspaceName: ports.workspaceName, session: nextSession });
}
