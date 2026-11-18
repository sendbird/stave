import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createSecondaryRunCoordinator } from "../electron/main/runs/secondary-run-coordinator";
import { generateTarsSuggestions } from "../electron/main/tars-suggestions";
import { parseTarsSuggestionOutput } from "../src/lib/tars/suggestion-generation";
import type { SecondaryProviderExecutionRequest } from "../src/lib/runs/secondary-run";

const input = { requestId: "suggest", language: "en", facts: [{ kind: "blocked", title: "Fix upload", count: 1 }] };
const chips = [{ label: "Investigate upload", prompt: "Why is Fix upload blocked?" }];
for (const mode of ["generated", "empty", "invalid", "truncated", "throw", "noSettings"] as const) {
  test(`saved settings -> durable tool-less run -> ${mode}`, async () => {
    const db = new Database(":memory:");
    try {
      const conversations = new TarsConversationStore(db);
      if (mode !== "noSettings") conversations.configure({ providerId: "codex", model: "saved-model", maxTurns: 6, runtimeHints: { codexReasoningEffort: "low" } });
      const ledger = new RunLedgerStore(db);
      const calls: SecondaryProviderExecutionRequest[] = [];
      const coordinator = createSecondaryRunCoordinator({
        getLedger: () => ({ getRunAggregate: ledger.getAggregate.bind(ledger), claimRunStep: ledger.claimStep.bind(ledger), markRunStepWaiting: ledger.markStepWaiting.bind(ledger), completeRunStep: ledger.completeStep.bind(ledger), failRunStep: ledger.failStep.bind(ledger), cancelRunStep: ledger.cancelStep.bind(ledger), listRunReceipts: ledger.listReceipts.bind(ledger) }),
        executeHost: async (request) => {
          calls.push(request);
          if (mode === "throw") throw new Error("Host unavailable");
          const text = mode === "invalid" ? '{"suggestions":[{"label":"wrong"}]}' : JSON.stringify({ suggestions: mode === "empty" ? [] : chips });
          return { executionId: request.executionId, providerId: request.input.providerId, model: request.input.model, status: "completed", text, truncated: mode === "truncated", eventCount: 2, collectedEventCount: 2, outputBytes: text.length, stopReason: null, error: null };
        }, cancelHost: async () => ({ ok: true }),
      });
      const result = await generateTarsSuggestions(input, { settings: () => conversations.getSettings(), coordinator, cwd: "/tmp/tars" });
      if (mode === "generated" || mode === "empty") expect(result).toMatchObject({ status: "generated", model: "saved-model", suggestions: mode === "empty" ? [] : chips });
      else expect(result).toMatchObject({ status: "failed", reason: mode === "invalid" ? "invalidOutput" : mode === "noSettings" ? "noSettings" : "provider" });
      expect(calls).toHaveLength(mode === "noSettings" ? 0 : 1);
      if (calls.length) expect(calls[0]?.input).toMatchObject({ providerId: "codex", model: "saved-model", toolsDisabled: true, runtimeHints: { codexReasoningEffort: "low" } });
    } finally { db.close(); }
  });
}

test("malformed, oversized and wrapped model output is rejected; valid empty remains empty", () => {
  for (const text of ['{"suggestions":[]', 'prefix {"suggestions":[]} suffix', '```json\n{"suggestions":[]}\n```', JSON.stringify({ suggestions: [{ label: "x", prompt: "x".repeat(401) }] })]) expect(parseTarsSuggestionOutput(text)).toBeNull();
  expect(parseTarsSuggestionOutput('{"suggestions":[]}')).toEqual([]);
});
