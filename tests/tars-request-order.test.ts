import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { observeTarsContext, TARS_INSTRUCTION_EXCERPT_CHARS, TARS_OBSERVED_REQUESTS_MAX, TARS_REQUEST_EXCERPT_CHARS } from "../electron/main/tars-context";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { resolveTarsWorkRequest } from "../src/lib/tars/brief";
import type { TarsDecisionAction, TarsMessageOrigin } from "../src/lib/tars/conversation";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { BUILTIN_PLANNER_AGENTS, REGISTRY, SETTINGS } from "./tars-test-context";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

const SOURCE = [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }] as PersistenceRepositoryRegistryEntry[];

/** Real stores on one database; messages are sent at the given times and admitted as the host admits a planner reply. */
function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const tars = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  conversations.configure(SETTINGS);
  let sequence = 0;
  const send = async (text: string, at: string, titles: string[], origin?: TarsMessageOrigin) => {
    const queued = conversations.create({ requestId: `message-${sequence++}`, text }, at, undefined, origin);
    const claimed = conversations.claim(queued.id, queued.revision, at);
    const actions: TarsDecisionAction[] = titles.map((title) => ({ kind: "delegate", workspaceId: "source", title,
      instruction: `Tars's instruction for ${title}. ${"detail ".repeat(60)}`, acceptanceCriteria: ["Done."], priority: 50 }));
    const answered = conversations.answer(claimed.id, claimed.revision, { reply: "Delegated.", actions }, at);
    const receipts = await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision },
      { conversations, responsibilities: tars, now: () => at, readRegistry: () => SOURCE, requestTick: () => {} });
    return { message: answered, rows: receipts.map((receipt) => tars.get(receipt.responsibilityId!)!) };
  };
  const observe = (withConversation = true) => observeTarsContext({ tars, loadRepositoryRegistry: () => REGISTRY, loadWorkspaceShellSummary: () => null,
    agentRuns: { getLatestAgentRunForTask: () => null }, ...(withConversation ? { tarsConversations: conversations } : {}) }, "2026-11-09T12:00:00.000Z");
  return { tars, conversations, send, observe };
}

/** Work an earlier Stave admitted: the same request id shape, but no saved request or instruction. */
function legacy(tars: TarsStore, requestId: string, title: string, at: string) {
  return tars.create({ requestId, title, instruction: `Original user mandate:\nOlder text.\n\nProposed work unit within that mandate:\n${title}.`,
    acceptanceCriteria: ["Done."], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, at);
}

describe("the planner sees the user's own requests and their order", () => {
  test("requests are listed oldest first with the works each admitted, whatever the queue order", async () => {
    const f = fixture();
    // Sent first, but delegated at a lower priority: the snapshot lists it last.
    const first = await f.send("검색 결과 정렬 버그 고쳐줘", "2026-11-09T09:00:00.000Z", ["Fix search sort"]);
    const second = await f.send("Add a dark mode toggle and its docs", "2026-11-09T10:00:00.000Z", ["Add the toggle", "Document the toggle"]);
    const third = await f.send("결제 화면 문구 다듬어줘", "2026-11-09T11:00:00.000Z", ["Polish checkout copy"]);
    f.tars.patch(third.rows[0]!.id, third.rows[0]!.revision, { priority: 90 }, "2026-11-09T11:00:01.000Z");

    const { observation } = f.observe();
    expect(observation.requests.map((request) => request.textExcerpt)).toEqual(["검색 결과 정렬 버그 고쳐줘", "Add a dark mode toggle and its docs", "결제 화면 문구 다듬어줘"]);
    expect(observation.requests[1]).toMatchObject({ messageId: second.message.id, sentAt: "2026-11-09T10:00:00.000Z", truncated: false, source: "saved",
      works: [{ id: second.rows[0]!.id, title: "Add the toggle", state: "queued" }, { id: second.rows[1]!.id, title: "Document the toggle", state: "queued" }] });
    expect(observation.omittedRequests).toBe(0);
    // Every responsibility names its request and says when it was created.
    const row = observation.responsibilities.find((entry) => entry.id === first.rows[0]!.id)!;
    expect(row).toMatchObject({ createdAt: "2026-11-09T09:00:00.000Z", request: { messageId: first.message.id } });
    expect(row.delegatedInstructionExcerpt?.length).toBe(TARS_INSTRUCTION_EXCERPT_CHARS);
    expect(row).toMatchObject({ delegatedInstructionTruncated: true });
  });

  test("excerpts and the request count stay bounded, and the planner prompt says how to answer in order", async () => {
    const f = fixture();
    const long = `${"가".repeat(TARS_REQUEST_EXCERPT_CHARS)}이 뒤는 잘린다`;
    await f.send(long, "2026-11-09T00:00:00.000Z", ["Long request"]);
    for (let index = 1; index <= TARS_OBSERVED_REQUESTS_MAX + 2; index++)
      await f.send(`Request ${index}`, `2026-11-09T01:${String(index).padStart(2, "0")}:00.000Z`, [`Unit ${index}`]);
    const context = f.observe();
    // The newest requests are kept; the oldest ones (the long one included) are counted, not shown.
    expect(context.observation.requests).toHaveLength(TARS_OBSERVED_REQUESTS_MAX);
    expect(context.observation.omittedRequests).toBe(3);
    expect(context.observation.requests.at(-1)?.textExcerpt).toBe(`Request ${TARS_OBSERVED_REQUESTS_MAX + 2}`);

    const single = fixture();
    await single.send(long, "2026-11-09T00:00:00.000Z", ["Long request"]);
    expect(single.observe().observation.requests[0]).toMatchObject({ textExcerpt: "가".repeat(TARS_REQUEST_EXCERPT_CHARS), truncated: true });

    const message = f.conversations.create({ requestId: "ask-order", text: "queued인 것들에 내가 쳤던 프롬프트 순서대로 줘" }, "2026-11-09T12:00:00.000Z");
    const prompt = buildTarsPlannerPrompt(message, { ...context, cwd: "/tmp/profile/representative", agents: BUILTIN_PLANNER_AGENTS }, []);
    expect(prompt).toContain("observation.requests lists the user's own messages");
    const supplied = JSON.parse(prompt.split("\n\n").at(-1)!);
    expect(supplied.observation.requests).toHaveLength(TARS_OBSERVED_REQUESTS_MAX);
    expect(supplied.observation.responsibilities[0]).toHaveProperty("createdAt");
  });

  test("older work recovers its exact message from the conversation; anything else is marked not stored", async () => {
    const f = fixture();
    const origin: TarsMessageOrigin = { kind: "answer", decisionId: "ask:message-earlier:0", optionIndex: 0, source: "click",
      question: "Which screen first?", rationale: "The checkout copy blocks the release." };
    const kept = f.conversations.create({ requestId: "older-message", text: "Checkout first, then\n  the settings page.", attachments: [
      { type: "image_context", label: "screen.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }] },
    "2026-11-01T08:00:00.000Z", undefined, origin);
    const recovered = legacy(f.tars, `tars-message:${kept.id}:0`, "Checkout copy", "2026-11-01T08:00:05.000Z");
    const gone = legacy(f.tars, "tars-message:deleted-message:0", "Gone message", "2026-11-01T07:00:00.000Z");
    const renderer = legacy(f.tars, "renderer-create", "Created directly", "2026-11-01T06:00:00.000Z");

    const { observation } = f.observe();
    expect(observation.requests).toEqual([{ messageId: kept.id, sentAt: "2026-11-01T08:00:00.000Z", textExcerpt: "Checkout first, then\n  the settings page.",
      truncated: false, source: "recovered", answeredQuestion: "Which screen first?", works: [{ id: recovered.id, title: "Checkout copy", state: "queued" }] }]);
    const byId = new Map(observation.responsibilities.map((row) => [row.id, row]));
    expect(byId.get(recovered.id)?.request).toEqual({ messageId: kept.id });
    expect(byId.get(gone.id)?.request).toBe("notStored");
    expect(byId.get(renderer.id)?.request).toBe("notStored");
    expect(byId.get(recovered.id)).not.toHaveProperty("delegatedInstructionExcerpt");
    // Without the conversation port the planner is told it is not stored, never given a guess.
    expect(f.observe(false).observation.requests).toEqual([]);
  });

  test("the request view shows the recovered original for older work", async () => {
    const f = fixture();
    const kept = f.conversations.create({ requestId: "older-message", text: "Rotate the keys.\n\n```yaml\nkey: x\n```" }, "2026-11-01T08:00:00.000Z");
    const recovered = legacy(f.tars, `tars-message:${kept.id}:0`, "Rotate keys", "2026-11-01T08:00:05.000Z");
    const gone = legacy(f.tars, "tars-message:deleted-message:0", "Gone message", "2026-11-01T07:00:00.000Z");
    const refuse = async (): Promise<never> => { throw new Error("Execution is not part of this test."); };
    const runtime = (readRequest?: (id: string) => ReturnType<TarsConversationStore["workRequestOf"]>) => createTarsRuntime({ store: f.tars,
      validateScope: async () => {}, prepareWorkspace: refuse, prepareTask: refuse, findRun: refuse, startRun: refuse, observe: refuse, controlRun: refuse,
      respondTask: refuse, now: () => "2026-11-09T00:00:00.000Z", ...(readRequest ? { readRequest } : {}) });
    const host = runtime((id) => f.conversations.workRequestOf(id));
    expect(await host.brief({ responsibilityId: recovered.id })).toEqual({ responsibilityId: recovered.id,
      request: { messageId: kept.id, text: "Rotate the keys.\n\n```yaml\nkey: x\n```", sentAt: "2026-11-01T08:00:00.000Z" },
      instruction: { source: "assignment", text: recovered.instruction }, context: null });
    expect((await host.brief({ responsibilityId: gone.id })).request).toBeNull();
    // A reader that fails or names another message leaves it unknown.
    expect(resolveTarsWorkRequest(recovered, () => { throw new Error("locked"); })).toBeNull();
    expect(resolveTarsWorkRequest(recovered, () => ({ messageId: "other", text: "x", sentAt: "2026-11-01T08:00:00.000Z" }))).toBeNull();
    // A saved request always wins over the conversation.
    const saved = { ...recovered, request: { messageId: kept.id, text: "Saved copy", sentAt: "2026-11-01T08:00:00.000Z" } };
    expect(resolveTarsWorkRequest(saved, () => { throw new Error("not read"); })).toEqual({ request: saved.request, source: "saved" });
  });
});
