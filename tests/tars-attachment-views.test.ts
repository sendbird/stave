import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsConversationMessage } from "../src/components/tars/TarsConversation";
import { TarsConversationSchema, TarsMessageViewSchema, tarsAttachmentSummary, tarsMessageView } from "../src/lib/tars/conversation";
import type { AttachmentContext } from "../src/lib/providers/attachment-context";
import { followUpFixture } from "./tars-follow-up-fixture";
import { SETTINGS } from "./tars-test-context";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

const IMAGE_BYTES = Buffer.concat([Buffer.from("screen-proof"), Buffer.alloc(70_001, 7)]);
const ATTACHMENTS: AttachmentContext[] = [
  { type: "file_context", filePath: "notes.md", content: "첨부 원문: keep every byte", language: "md" },
  { type: "image_context", label: "screen.png", mimeType: "image/png", dataUrl: `data:image/png;base64,${IMAGE_BYTES.toString("base64")}` },
  // One and two padding characters.
  { type: "image_context", label: "one.gif", mimeType: "image/gif", dataUrl: `data:image/gif;base64,${Buffer.from([1, 2]).toString("base64")}` },
  { type: "image_context", label: "two.webp", mimeType: "image/webp", dataUrl: `data:image/webp;base64,${Buffer.from([1]).toString("base64")}` },
];
const SUMMARIES = [
  { kind: "file", name: "notes.md", type: "md", size: Buffer.byteLength("첨부 원문: keep every byte") },
  { kind: "image", name: "screen.png", type: "image/png", size: IMAGE_BYTES.byteLength },
  { kind: "image", name: "one.gif", type: "image/gif", size: 2 },
  { kind: "image", name: "two.webp", type: "image/webp", size: 1 },
];

describe("a window reads attachment summaries, never their content", () => {
  test("the store measures each attachment in SQL exactly as the shared helper does", () => {
    const database = new Database(":memory:"); cleanup.push(() => database.close());
    const store = new TarsConversationStore(database);
    store.configure(SETTINGS);
    const plain = store.create({ requestId: "plain", text: "No attachments" }, "2026-11-09T00:00:00.000Z");
    const attached = store.create({ requestId: "attached", text: "With attachments", attachments: ATTACHMENTS }, "2026-11-09T00:00:01.000Z");
    const later = store.create({ requestId: "later", text: "Asked after" }, "2026-11-09T00:00:02.000Z");

    const views = store.listViews(10);
    expect(views.map((view) => view.id)).toEqual([plain.id, attached.id, later.id]);
    expect(views[1]!.attachments).toEqual(SUMMARIES);
    expect(views[0]).not.toHaveProperty("attachments");
    // The SQL path and the IPC path (`tarsMessageView`) agree, and both keep every other field.
    expect(views[1]).toEqual(tarsMessageView(store.get(attached.id)!));
    expect(ATTACHMENTS.map(tarsAttachmentSummary)).toEqual(SUMMARIES);
    for (const view of views) TarsMessageViewSchema.parse(view);
    const encoded = JSON.stringify(views);
    expect(encoded).not.toContain("data:image");
    expect(encoded).not.toContain("keep every byte");
    // History before a message is words only, too; the saved message itself is unchanged.
    expect(JSON.stringify(store.listBefore(later.id, 8))).not.toContain("data:image");
    expect(store.get(attached.id)!.attachments).toEqual(ATTACHMENTS);
    expect(store.latestId()).toBe(later.id);
  });

  test("the conversation snapshot carries no data URLs while the planner still receives the attachments", async () => {
    const f = followUpFixture(); cleanup.push(f.close);
    f.service.start();
    const sent = f.service.sendMessage({ requestId: "with-image", text: "What does this screen show?", attachments: ATTACHMENTS });
    await f.service.whenIdle();
    // The planner input is the saved snapshot, byte for byte.
    expect(f.planner).toHaveLength(1);
    expect(f.planner[0]!.input.attachments).toEqual(ATTACHMENTS);
    const conversation = f.service.getConversation();
    TarsConversationSchema.parse(conversation);
    expect(conversation.messages.find((message) => message.id === sent.id)?.attachments).toEqual(SUMMARIES);
    const encoded = JSON.stringify(conversation);
    expect(encoded).not.toContain("data:image");
    expect(encoded).not.toContain(IMAGE_BYTES.subarray(0, 12).toString("base64"));
    expect(encoded).not.toContain("keep every byte");
    // A full message cannot pass as a window's conversation.
    expect(() => TarsConversationSchema.parse({ ...conversation, messages: [f.conversations.get(sent.id)] })).toThrow();
  });

  test("the conversation shows each attachment's name from its summary", () => {
    const message = tarsMessageView({ id: "m", requestId: "r", text: "", attachments: ATTACHMENTS.slice(0, 2), providerId: "codex", model: "test-model", maxTurns: 6,
      revision: 1, state: "queued", reply: null, decision: null, error: null, createdAt: "2026-11-09T00:00:00.000Z", updatedAt: "2026-11-09T00:00:00.000Z" });
    const html = renderToStaticMarkup(createElement(TarsConversationMessage, { message, receipts: [], name: "Tars", busy: false, onCancel() {} }));
    expect(html).toContain("notes.md");
    expect(html).toContain("screen.png");
    expect(html).toContain('data-tars-attachment-kind="image"');
  });
});
