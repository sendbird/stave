import { i18n } from "../../src/i18n/runtime";
import { randomUUID } from "node:crypto";
import { buildSteeredUserMessageState } from "../../src/store/chat-state-helpers";
import type { WorkspaceSessionState } from "../../src/store/workspace-session-state";
import type { ChatMessage } from "../../src/types/chat";
import type {
  ProviderId,
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
} from "../../src/lib/providers/provider.types";

type SteerHandler = (
  request: ProviderSteerTurnRequest,
) => Promise<ProviderSteerTurnResponse>;

interface HostTurn {
  turnId: string;
  workspaceId: string;
  workspaceName: string;
  taskId: string;
  provider: ProviderId;
  model: string;
}

/** Delta writes preserve unchanged rows in the additive transcript store. */
export function collectChangedMessages(args: { before: ChatMessage[]; after: ChatMessage[] }) {
  const beforeById = new Map(args.before.map((item) => [item.id, item]));
  return args.after.filter((message) => beforeById.get(message.id) !== message);
}

/** Keep host transcript mutations in the same queue as their provider events. */
export function createHostTaskSteerCoordinator(deps: {
  send: SteerHandler;
  serialize: <T>(workspaceId: string, operation: () => Promise<T>) => Promise<T>;
  loadSession: (turn: HostTurn) => Promise<WorkspaceSessionState>;
  persist: (turn: HostTurn, session: WorkspaceSessionState, changed: ChatMessage[]) => Promise<void>;
}) {
  const handlers = new Map<string, SteerHandler>();
  const coordinator = {
    register(turn: HostTurn) {
      const receipts = new Map<string, Promise<ProviderSteerTurnResponse>>();
      const deliver: SteerHandler = (request) => deps.serialize(turn.workspaceId, async () => {
        const response = await deps.send(request);
        if (!response.ok) return response;
        try {
          const current = await deps.loadSession(turn);
          const steered = buildSteeredUserMessageState({
            messagesByTask: current.messagesByTask,
            messageCountByTask: current.messageCountByTask,
            taskId: turn.taskId,
            content: request.text,
            questionReply: request.questionReply,
            steeredIntoTurnId: turn.turnId,
            clientMessageId: request.clientMessageId ?? randomUUID(),
            provider: turn.provider,
            activeModel: turn.model,
            turnStillActive: current.activeTurnIdsByTask[turn.taskId] === turn.turnId,
          });
          await deps.persist(turn, { ...current, ...steered }, collectChangedMessages({
            before: current.messagesByTask[turn.taskId] ?? [],
            after: steered.messagesByTask[turn.taskId] ?? [],
          }));
          return response;
        } catch (error) {
          console.error("[host-task-steer] could not persist accepted steer", error);
          // Delivery already happened. Never invite an automatic resend.
          return {
            ok: false,
            delivery: "unknown",
            message: i18n.t("notifications:steerSubmit.steerDeliveryCouldNotBeConfirmedWaitForTheCurrentResponseBeforeRetryingOrQueueing"),
          };
        }
      });
      handlers.set(turn.turnId, (request) => {
        const id = request.clientMessageId;
        if (!id) return deliver(request);
        const existing = receipts.get(id);
        if (existing) return existing;
        const pending = deliver(request);
        receipts.set(id, pending);
        void pending.then((response) => {
          if (response.delivery === "rejected") receipts.delete(id);
        }, () => receipts.delete(id));
        return pending;
      });
    },
    unregister(turnId: string) {
      handlers.delete(turnId);
    },
    clear() {
      handlers.clear();
    },
    steer(request: ProviderSteerTurnRequest) {
      return (handlers.get(request.turnId) ?? deps.send)(request);
    },
    /** Routes steers to `turn` while it starts; a start that throws or fails releases the route. */
    startTurn<T extends { ok: boolean }>(turn: HostTurn, start: () => T): T {
      coordinator.register(turn);
      let started: T | undefined;
      try {
        started = start();
        return started;
      } finally {
        if (!started?.ok) coordinator.unregister(turn.turnId);
      }
    },
  };
  return coordinator;
}
