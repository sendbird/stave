import { Database } from "bun:sqlite";
import { afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsConversationStore } from "../../electron/persistence/tars-conversation-store";
import { TarsStore } from "../../electron/persistence/tars-store";
import { RunLedgerStore } from "../../electron/persistence/run-ledger-store";
import { applyTarsDecision } from "../../electron/host-service/tars-decisions";
import { createSecondaryRunCoordinator } from "../../electron/main/runs/secondary-run-coordinator";
import { createTarsConversationService } from "../../electron/main/tars-conversation-service";
import { createTarsRuntime } from "../../electron/host-service/tars-runtime";
import { actTars } from "../../electron/host-service/tars-control";
import { REGISTRY, SETTINGS, testContext } from "../tars-test-context";
import type { SecondaryProviderExecutionRequest } from "../../src/lib/runs/secondary-run";
import type { CreateTarsResponsibilityInput, TarsResponsibilityPatch } from "../../src/lib/tars/types";
const T0 = Date.parse("2026-11-05T00:00:00.000Z");
export const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

export function database(filename = ":memory:") {
  const db = new Database(filename);
  cleanup.push(() => { if (!db.closed) db.close(); });
  return db;
}
export function persisted() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-clear-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "store.sqlite");
}
const unit = (id: string): CreateTarsResponsibilityInput => ({ requestId: `request-${id}`, title: `Work ${id}`, instruction: "Do the work.",
  acceptanceCriteria: ["It works."], completionGoal: "implementation", workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" });
/** A responsibility moved to `state` (and anything else in `patch`) at `when`. */
export function row(store: TarsStore, id: string, patch: TarsResponsibilityPatch, when: string) {
  const created = store.create(unit(id), when);
  return store.patch(created.id, created.revision, patch, when);
}
export function service(options: { filename?: string; start?: number; answer?: (request: SecondaryProviderExecutionRequest) => string;
  /** Runs before the runtime records a run control: a throw stands for a control whose outcome is not known. */
  controlRun?: Parameters<typeof createTarsRuntime>[0]["controlRun"]; findRun?: () => Promise<string | null> } = {}) {
  let clock = options.start ?? 100;
  const now = () => at(clock++);
  const db = database(options.filename);
  const conversations = new TarsConversationStore(db);
  if (!conversations.getSettings()) conversations.configure(SETTINGS);
  const responsibilities = new TarsStore(db, { now });
  const ledger = new RunLedgerStore(db);
  const requests: SecondaryProviderExecutionRequest[] = [];
  const runtime = createTarsRuntime({ store: responsibilities, now, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: options.findRun ?? (async () => null),
    startRun: async (entry) => `run-${entry.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (entry, operation, max, commandId) => { if (options.controlRun) await options.controlRun(entry, operation, max, commandId); controls.push([entry.id, operation]); } });
  const controls: Array<[string, string]> = [];
  const coordinator = createSecondaryRunCoordinator({
    getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger),
      markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger),
      failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
    executeHost: async (request) => {
      requests.push(request);
      const text = options.answer?.(request) ?? JSON.stringify({ reply: "Noted.", actions: [] });
      return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text, truncated: false,
        eventCount: 1, collectedEventCount: 1, outputBytes: Buffer.byteLength(text), stopReason: null, error: null };
    },
    cancelHost: async () => ({ ok: true }), now,
  });
  const svc = createTarsConversationService({ conversations, responsibilities, coordinator, now,
    context: async () => testContext(responsibilities, REGISTRY),
    applyDecision: (input) => applyTarsDecision(input, { conversations, responsibilities, readRegistry: () => REGISTRY, requestTick: () => {}, control: runtime.act, now }),
    act: (input) => actTars(input, { conversations, runtime, now }),
  });
  return { db, conversations, responsibilities, requests, controls, service: svc, now, act: (input: unknown) => actTars(input, {conversations, runtime, now}) };
}
