import {
  displayTurnReceipt, type TurnTerminalReceipt,
} from "../../src/lib/providers/turn-terminal-receipt";
import type { WorkspaceSessionState } from "../../src/store/workspace-session-state";

/** The durable turn result replaces replay guesses before messages are persisted. */
export function attachTurnReceiptToSession(
  session: WorkspaceSessionState,
  taskId: string,
  turnId: string,
  receipt: TurnTerminalReceipt | null,
): WorkspaceSessionState {
  const displayed = displayTurnReceipt(receipt);
  if (!displayed) return session;
  return {
    ...session,
    messagesByTask: {
      ...session.messagesByTask,
      [taskId]: (session.messagesByTask[taskId] ?? []).map((message) =>
        message.role === "assistant" && message.turnId === turnId
          ? { ...message, terminalReceipt: displayed } : message,
      ),
    },
  };
}
