import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeProviderSource } from "@/lib/providers/bridge.source";
import type { ProviderTurnRequest } from "@/lib/providers/provider.types";

/**
 * A request too large for the host transport is compacted before it is sent.
 * The answers the request names (`subagentAnswers`) are what the host records
 * as delivered, so they must match what the sent request still carries: the
 * Subagent results part travels whole or not at all, and its refs with it.
 */

const originalWindow = (globalThis as { window?: unknown }).window;
afterEach(() => { (globalThis as { window?: unknown }).window = originalWindow; });

const refs = [{ runId: "child-task:parent:docs", sequence: 3 }, { runId: "child-task:parent:docs", sequence: 7 }];
// Twenty subagent rows with long reasons, then two answers: past the per-part transport budget.
const rows = Array.from({ length: 20 }, (_, i) => `- subagent: k${i} | phase: completed\n  task: child-${i} in workspace ws\n  reason: ${"r".repeat(300)}\n  extra: ${"e".repeat(60)}`).join("\n");
const answers = ["New answers, oldest first:", "- answer from subagent docs (task child-1)", "  result:", `    ${"A".repeat(1_900)}`,
  "- answer from subagent docs (task child-1)", "  result:", `    ${"B".repeat(1_900)}`].join("\n");
const results = { type: "retrieved_context" as const, sourceId: "stave:delegated-tasks", title: "Subagent results", content: `${rows}\n\n${answers}` };

function request(args: { fileBytes: number; promptBytes?: number }): ProviderTurnRequest {
  const prompt = "next".padEnd(args.promptBytes ?? 4, "p");
  return {
    turnId: "turn", taskId: "parent", cwd: "/tmp", prompt, subagentAnswers: refs, runtimeOptions: { chatStreamingEnabled: false },
    conversation: {
      target: { providerId: "codex", model: "m" }, mode: "chat", history: [],
      input: { role: "user", providerId: "user", content: "next", parts: [{ type: "text", text: "next" }] },
      contextParts: [results, { type: "file_context", filePath: "big.txt", language: "text", content: "f".repeat(args.fileBytes) }],
    },
  } as ProviderTurnRequest;
}

async function send(turn: ProviderTurnRequest) {
  const sent: ProviderTurnRequest[] = [];
  (globalThis as { window?: unknown }).window = { api: { provider: { streamTurn: async (args: ProviderTurnRequest) => { sent.push(args); return [{ type: "done" }]; } } } };
  for await (const _event of createBridgeProviderSource({ providerId: "codex" }).streamTurn(turn)) { /* drain */ }
  return sent.at(-1)!;
}

const sentResults = (sent: ProviderTurnRequest) => sent.conversation?.contextParts.find((part) => part.type === "retrieved_context" && part.sourceId === "stave:delegated-tasks");

describe("subagent answers across transport compaction", () => {
  test("turn after turn, a compacted request keeps the results part whole and the refs of the answers it carries", async () => {
    expect(results.content.length).toBeGreaterThan(12 * 1024);
    for (let turn = 0; turn < 3; turn += 1) {
      const sent = await send(request({ fileBytes: 1_200_000 }));
      // The large file was cut to fit; the answers were not.
      const file = sent.conversation?.contextParts.find((part) => part.type === "file_context");
      expect(file && file.type === "file_context" ? file.content.length : 0).toBeLessThan(1_200_000);
      const carried = sentResults(sent);
      expect(carried?.type === "retrieved_context" ? carried.content : "").toContain(`    ${"A".repeat(1_900)}`);
      expect(carried?.type === "retrieved_context" ? carried.content : "").toContain(`    ${"B".repeat(1_900)}`);
      expect(sent.subagentAnswers).toEqual(refs);
      expect(carried).toEqual(results);
    }
  });

  test("a request that must shed every context part sheds the refs with them", async () => {
    const sent = await send(request({ fileBytes: 10, promptBytes: 1_000_000 }));
    expect(sentResults(sent)).toBeUndefined();
    expect(sent).not.toHaveProperty("subagentAnswers");
  });
});
