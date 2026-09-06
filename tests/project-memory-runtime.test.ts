import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ProjectMemoryStore } from "../electron/persistence/project-memory-store";
import { recallProjectMemoryRetrievedContext, rememberTurnDurableFacts } from "../src/store/project-memory-runtime";
import { buildCanonicalConversationRequest, buildLegacyPromptFromCanonicalRequest } from "../src/lib/providers/canonical-request";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";
import { resolveProjectMemoryRecallQuery } from "../src/lib/task-context/project-memory";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
function setApi(projectMemory: unknown) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { projectMemory } } });
}

describe("project memory turn boundary", () => {
  test("current work selects curated memory, and every provider receives the same bounded context", async () => {
    const store = new ProjectMemoryStore(new Database(":memory:"));
    store.remember({ projectPath: "/tmp/project", kind: "gotcha", content: "Terminal snapshots need stable slot keys.", confidence: 0.9 });
    store.remember({ projectPath: "/tmp/project", kind: "fact", content: "Composer uses derived colors.", confidence: 0.9 });
    store.remember({ projectPath: "/tmp/project", kind: "fact", content: "Terminal candidate should not be recalled.", confidence: 0.6 });
    setApi({ recall: async (args: { projectPath: string; query: string }) => ({ ok: true, items: store.recall(args) }) });
    const prompt = "Investigate terminal snapshots";
    const part = await recallProjectMemoryRetrievedContext({ projectPath: "/tmp/project", history: [{ role: "user", content: "Review the composer" }], prompt });
    expect(part?.content).toContain("stable slot keys");
    expect(part?.content).not.toContain("Composer");
    expect(part?.content).not.toContain("candidate should");
    for (const providerId of ["claude-code", "codex", "cursor", "kiro"] as const) {
      const conversation = buildCanonicalConversationRequest({ providerId, model: "test-model", userInput: prompt, history: [], retrievedContextParts: [part!] });
      expect(StreamTurnArgsSchema.safeParse({ providerId, prompt, conversation, runtimeOptions: {} }).success).toBe(true);
      expect(buildLegacyPromptFromCanonicalRequest({ request: conversation })).toContain(part!.content);
    }
  });

  test("failed recall is omitted, and summary writes stay automatic", async () => {
    setApi({ recall: async () => { throw new Error("Database unavailable"); } });
    expect(await recallProjectMemoryRetrievedContext({ projectPath: "/tmp/project", history: [], prompt: "Investigate snapshots" })).toBeNull();
    const writes: unknown[] = [];
    setApi({ remember: async (args: unknown) => { writes.push(args); return { ok: true, results: [] }; } });
    rememberTurnDurableFacts({ projectPath: "/tmp/project", taskId: "task", turnId: "turn", facts: [{ kind: "fact", content: "Candidate." }] });
    expect(writes).toEqual([{ projectPath: "/tmp/project", source: "auto", sourceTaskId: "task", sourceTurnId: "turn", facts: [{ kind: "fact", content: "Candidate." }] }]);
  });

  test("long prompts fit IPC and short continuation uses recent context", () => {
    expect(resolveProjectMemoryRecallQuery({ history: [], prompt: "x".repeat(10000) })).toHaveLength(8000);
    expect(resolveProjectMemoryRecallQuery({ history: [{ role: "user", content: "Old composer task" }, { role: "user", content: "Current terminal task" }], prompt: "계속" })).toBe("Current terminal task\n계속");
  });
});
