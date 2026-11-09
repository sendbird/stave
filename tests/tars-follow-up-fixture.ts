import { Database } from "bun:sqlite";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime, type TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";
import type { TarsDecision } from "../src/lib/tars/conversation";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";
import { REGISTRY, SETTINGS, testContext } from "./tars-test-context";

export const START = "2026-11-05T00:00:00.000Z";
export const minutes = (count: number) => count * 60_000;

/**
 * The real stores, host runtime, decision admission and conversation service
 * on one database. Only the model (a fake planner that records every call),
 * the run port and the clock are simulated.
 */
export function followUpFixture(options: { filename?: string; maxTurns?: number; replies?: TarsDecision[];
  /** Runs while the model is "thinking", for changes that race the planner. */
  duringPlanner?: () => Promise<void> | void; } = {}) {
  const database = new Database(options.filename ?? ":memory:");
  const conversations = new TarsConversationStore(database);
  if (!conversations.getSettings()) conversations.configure({ ...SETTINGS, maxTurns: options.maxTurns ?? SETTINGS.maxTurns });
  let clock = Date.parse(START);
  const now = () => new Date(clock).toISOString();
  const responsibilities = new TarsStore(database, { now });
  const ledger = new RunLedgerStore(database);
  const planner: SecondaryProviderExecutionRequest[] = [];
  const replies = [...(options.replies ?? [])];
  const observations = new Map<string, TarsExecutionObservation>();
  const runControls: string[] = [];
  const errors: unknown[] = [];
  const runtime = createTarsRuntime({ store: responsibilities, now, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`,
    // Unless a test says otherwise, the run is observed as it was last saved: an unchanged observation.
    observe: async (row) => observations.get(row.id) ?? { state: row.state === "preparing" ? "running" : row.state as TarsExecutionObservation["state"],
      detail: row.detail, detailCode: row.detailCode ?? null, detailParams: row.detailParams ?? null, stageAsksUser: row.stageAsksUser,
      runTurns: row.observedTurns },
    controlRun: async (_row, operation) => { runControls.push(operation); } });
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      planner.push(request);
      await options.duringPlanner?.();
      const text = JSON.stringify(replies.shift() ?? { reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model,
        status: "completed", text, truncated: false, eventCount: 2, collectedEventCount: 2,
        outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now,
  });
  const service = createTarsConversationService({ conversations, responsibilities, coordinator, now,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, { conversations, responsibilities, readRegistry: () => REGISTRY,
      requestTick: () => runtime.requestTick(), control: runtime.act, now }),
    act: (input) => actTars(input, { conversations, runtime, now }),
    retryDelaysMs: [60_000], onError: (error) => errors.push(error),
  });
  let made = 0;
  /** A responsibility Tars holds with a run, in the given state. */
  const responsibility = (state: TarsState, patch: Partial<TarsResponsibility> = {}) => {
    const row = responsibilities.create({ requestId: `responsibility-${made++}`, title: `Release check ${made}`,
      instruction: "Original user mandate:\nVerify the release.\n\nProposed work unit within that mandate:\nRun the release checks.",
      acceptanceCriteria: ["Checks pass"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, now());
    return responsibilities.patch(row.id, row.revision, { state, taskId: `tars-${row.id}`, executionWorkspaceId: "execution",
      agentRunId: `run-${row.id}`, ...patch }, now());
  };
  /** One host tick and the conversation queue it wakes, as the host's change event would. */
  const settle = async () => {
    runtime.requestTick(); await runtime.drain();
    service.wake(); await service.whenIdle(); await runtime.drain();
  };
  const automatic = () => conversations.list(1_000).filter((message) => message.origin?.kind === "followUp" || message.origin?.kind === "reask");
  const send = async (text: string) => {
    const message = service.sendMessage({ requestId: `message-${made++}`, text });
    await service.whenIdle(); await runtime.drain();
    return message;
  };
  return { database, conversations, responsibilities, runtime, service, planner, replies, observations, runControls, errors,
    responsibility, settle, automatic, send, now, advance: (ms: number) => { clock += ms; },
    close: async () => { runtime.stop(); await service.stop(); if (!database.closed) database.close(); } };
}
