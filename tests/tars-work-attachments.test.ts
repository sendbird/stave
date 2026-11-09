import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { tarsExecutionInstructions, tarsRunInitialContext } from "../electron/host-service/tars-execution";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { AgentRunStartArgsSchema } from "../electron/main/ipc/agent-run-schemas";
import { observeTarsContext } from "../electron/main/tars-context";
import { buildCanonicalConversationRequest } from "../src/lib/providers/canonical-request";
import { buildProviderTurnPrompt } from "../src/lib/providers/provider-request-translators";
import { buildClaudeNativeImageBlocks, buildCodexNativeImageItems, collectNativeImageInputs } from "../electron/providers/native-image-input";
import type { AttachmentContext } from "../src/lib/providers/attachment-context";
import type { TarsDecisionAction } from "../src/lib/tars/conversation";
import { buildTarsBrief } from "../src/lib/tars/brief";
import { tarsSnapshotForWindow, type TarsResponsibility } from "../src/lib/tars/types";
import { resolveTarsRunAttachments } from "../src/lib/tars/work-attachments";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const NOW = "2026-11-09T00:00:00.000Z";
// "screen" in base64 is `c2NyZWVu`: the image's bytes, which only the message's row may hold.
const SCREEN_BASE64 = Buffer.from("screen-capture-bytes").toString("base64");
const NOTES = "tars-attachment-proof: the button overlaps the header";
const ATTACHMENTS: AttachmentContext[] = [
  { type: "file_context", filePath: "notes.txt", content: NOTES, language: "txt" },
  { type: "image_context", label: "screen.png", dataUrl: `data:image/png;base64,${SCREEN_BASE64}`, mimeType: "image/png" },
];
const REGISTRY = [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[];
const delegate = (title: string, extra: Partial<Extract<TarsDecisionAction, { kind: "delegate" }>> = {}): TarsDecisionAction => ({ kind: "delegate",
  workspaceId: "source-workspace", title, instruction: `${title} and verify it.`, acceptanceCriteria: ["The result is verified."], priority: 50, ...extra });

const directories: string[] = [];
const databases: Database[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) database.close();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function stores(database: Database) {
  databases.push(database);
  return { conversations: new TarsConversationStore(database), responsibilities: new TarsStore(database) };
}

/** Saves one answered message with the user's words, its attachments and Tars's decision, then admits the decision. */
async function admit(database: Database, actions: TarsDecisionAction[], attachments: AttachmentContext[] = ATTACHMENTS) {
  const { conversations, responsibilities } = stores(database);
  const ports: TarsDecisionPorts = { conversations, responsibilities, now: () => NOW, readRegistry: () => REGISTRY, requestTick: () => {} };
  conversations.configure({ providerId: "claude-code", model: "sonnet", maxTurns: 6 });
  const queued = conversations.create({ requestId: "screenshot", text: "Fix what the screenshot shows.", attachments }, NOW);
  const claimed = conversations.claim(queued.id, queued.revision, NOW);
  const message = conversations.answer(claimed.id, claimed.revision, { reply: "I will fix it.", actions }, NOW);
  const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports);
  return { conversations, responsibilities, ports, message, receipts };
}

/** What preparation records before a run starts: the work's task and execution workspace. */
function prepared(store: TarsStore, row: TarsResponsibility) {
  return store.patch(row.id, row.revision, { state: "preparing", taskId: `tars-${row.id}`, executionWorkspaceId: `execution-${row.id}` }, NOW);
}

describe("Tars work attachments", () => {
  test("a delegated work keeps a bounded reference to its message's attachments, never their content", async () => {
    const database = new Database(":memory:");
    const { responsibilities, message, receipts, ports } = await admit(database, [delegate("Fix the header")]);
    expect(receipts).toMatchObject([{ status: "applied" }]);
    const [row] = responsibilities.snapshot().responsibilities;
    expect(row!.attachments).toEqual({ messageId: message.id, items: [
      { index: 0, kind: "file", name: "notes.txt", type: "txt", size: Buffer.byteLength(NOTES) },
      { index: 1, kind: "image", name: "screen.png", type: "image/png", size: Buffer.byteLength("screen-capture-bytes") },
    ] });
    // Neither the saved row nor any snapshot holds the content: only the message's row does.
    const saved = database.prepare("SELECT body_json FROM tars_responsibilities").get() as { body_json: string };
    for (const text of [saved.body_json, JSON.stringify(responsibilities.snapshot())]) {
      expect(text).not.toContain(SCREEN_BASE64);
      expect(text).not.toContain(NOTES);
    }
    // A window's snapshot leaves the names to the request view.
    expect(tarsSnapshotForWindow(responsibilities.snapshot()).responsibilities[0]).not.toHaveProperty("attachments");
    expect(buildTarsBrief(row!).attachments).toEqual([
      { kind: "file", name: "notes.txt", type: "txt", size: Buffer.byteLength(NOTES) },
      { kind: "image", name: "screen.png", type: "image/png", size: Buffer.byteLength("screen-capture-bytes") },
    ]);
    // The planner learns that the work carries them, by name only.
    const observed = observeTarsContext({ tars: responsibilities, agentRuns: { getLatestAgentRunForTask: () => null },
      loadRepositoryRegistry: () => [], loadWorkspaceShellSummary: () => null }, NOW).observation;
    expect(observed.responsibilities[0]).toMatchObject({ attachments: ["notes.txt", "screen.png"] });
    expect(JSON.stringify(observed)).not.toContain(SCREEN_BASE64);
    // A replayed admission finds the same work: the reference is part of its request identity.
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports)).toEqual(receipts);
    expect(responsibilities.snapshot().responsibilities).toHaveLength(1);
  });

  test("each work of one decision carries every attachment unless Tars names the ones it needs", async () => {
    const database = new Database(":memory:");
    const { responsibilities, receipts } = await admit(database, [
      delegate("Fix the header"),
      delegate("Fix the image", { attachments: [1, 1] }),
      delegate("Update the docs", { attachments: [] }),
      delegate("Fix the footer", { attachments: [2] }),
    ]);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied", "applied", "rejected"]);
    expect(receipts[3]).toMatchObject({ reason: "attachmentUnknown" });
    const byTitle = new Map(responsibilities.snapshot().responsibilities.map((row) => [row.title, row]));
    expect(byTitle.get("Fix the header")!.attachments?.items.map((item) => item.name)).toEqual(["notes.txt", "screen.png"]);
    expect(byTitle.get("Fix the image")!.attachments?.items).toEqual([{ index: 1, kind: "image", name: "screen.png", type: "image/png", size: 20 }]);
    expect(byTitle.get("Update the docs")!).not.toHaveProperty("attachments");
    expect(byTitle.has("Fix the footer")).toBe(false);
    expect(buildTarsBrief(byTitle.get("Update the docs")!)).not.toHaveProperty("attachments");
  });

  test("a message without attachments delegates work that carries none", async () => {
    const { responsibilities, receipts } = await admit(new Database(":memory:"), [delegate("Fix the header")], []);
    expect(receipts).toMatchObject([{ status: "applied" }]);
    expect(responsibilities.snapshot().responsibilities[0]).not.toHaveProperty("attachments");
    expect(tarsRunInitialContext(responsibilities.snapshot().responsibilities[0]!, { representative: "Tars", responsibilities: [] }))
      .not.toHaveProperty("attachmentSource");
  });

  test("after a restart before its run starts, the work's first turn still reads the attachments from the message", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "stave-tars-attachments-"));
    directories.push(directory);
    const file = path.join(directory, "stave.sqlite");
    const first = new Database(file);
    const admitted = await admit(first, [delegate("Fix the header")]);
    const queued = admitted.responsibilities.snapshot().responsibilities[0]!;
    first.close(); databases.splice(databases.indexOf(first), 1);

    // A new process: the queued work and its message are read back from disk.
    const reopened = stores(new Database(file));
    const row = prepared(reopened.responsibilities, reopened.responsibilities.get(queued.id)!);
    const context = tarsRunInitialContext(row, { representative: "Tars", responsibilities: [] });
    expect(context.attachmentSource).toBe(`tars-work:${row.id}`);
    // The run itself keeps only that reference, never the content.
    expect(JSON.stringify(context)).not.toContain(SCREEN_BASE64);
    expect(tarsExecutionInstructions(row)).toContain("\"notes.txt\", \"screen.png\"");
    const reads = { responsibility: (id: string) => reopened.responsibilities.get(id), attachments: (id: string) => reopened.conversations.attachmentsOf(id) };
    const lead = { leadTaskId: row.taskId!, workspaceId: row.executionWorkspaceId! };
    expect(resolveTarsRunAttachments(context.attachmentSource!, lead, reads)).toEqual({
      fileContexts: [{ filePath: "notes.txt", content: NOTES, language: "txt" }],
      imageContexts: [{ dataUrl: `data:image/png;base64,${SCREEN_BASE64}`, label: "screen.png", mimeType: "image/png" }],
    });
    // Only the run leading the work's own task may read them.
    expect(() => resolveTarsRunAttachments(context.attachmentSource!, { ...lead, leadTaskId: "another-task" }, reads)).toThrow("does not lead the work");
    expect(() => resolveTarsRunAttachments("tars-work:missing", lead, reads)).toThrow("does not lead the work");
    // A message that is gone is a failed read, never a turn without what the user showed.
    expect(() => resolveTarsRunAttachments(context.attachmentSource!, lead, { ...reads, attachments: () => null })).toThrow("no longer saved");
  });

  test.each(["claude-code", "codex"] as const)("the first turn sends the work's attachments to %s as the composer does: image natively, file in the prompt", async (providerId) => {
    const database = new Database(":memory:");
    const { responsibilities, conversations } = await admit(database, [delegate("Fix the header")]);
    const row = prepared(responsibilities, responsibilities.snapshot().responsibilities[0]!);
    const context = tarsRunInitialContext(row, { representative: "Tars", responsibilities: [] });
    const attachments = resolveTarsRunAttachments(context.attachmentSource!, { leadTaskId: row.taskId!, workspaceId: row.executionWorkspaceId! },
      { responsibility: (id) => responsibilities.get(id), attachments: (id) => conversations.attachmentsOf(id) });
    // What the supervised turn builds from the run's first-turn context (`runTask`).
    const conversation = buildCanonicalConversationRequest({ providerId, history: [], userInput: row.instruction,
      fileContexts: attachments.fileContexts, imageContexts: attachments.imageContexts, retrievedContextParts: context.retrievedContextParts });
    const prompt = buildProviderTurnPrompt({ providerId, prompt: row.instruction, conversation, includeImageData: false });
    expect(prompt).toContain(NOTES);
    expect(prompt).not.toContain(SCREEN_BASE64);
    const { inputs } = collectNativeImageInputs({ cwd: "/tmp/execution", conversation });
    expect(inputs.map((input) => input.label)).toEqual(["screen.png"]);
    if (providerId === "codex") expect(buildCodexNativeImageItems(inputs)).toEqual([{ type: "image", url: `data:image/png;base64,${SCREEN_BASE64}`, detail: "original" }]);
    else expect((await buildClaudeNativeImageBlocks({ inputs })).blocks).toEqual([{ type: "image", source: { type: "base64", media_type: "image/png", data: SCREEN_BASE64 } }]);
  });

  test("a renderer's run start cannot name an attachment source", () => {
    const start = { workspaceId: "workspace", leadTaskId: "task", origin: "agent" as const, assignment: "Fix it.",
      workflow: { version: 1, id: "agent", name: "Agent", purpose: "Fix it.", checkIns: "when-stuck", team: "workers", createdAt: NOW, updatedAt: NOW,
        stages: [{ id: "work", title: "Work", kind: "ai", instruction: "Fix it.", doneWhen: "Fixed." }] },
      consent: { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] } };
    expect(AgentRunStartArgsSchema.safeParse(start).success).toBe(true);
    expect(AgentRunStartArgsSchema.safeParse({ ...start, initialContext: { attachmentSource: "tars-work:someone-else" } }).success).toBe(false);
  });
});
