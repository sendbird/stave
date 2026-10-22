import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LensReviewRecordStore } from "../electron/persistence/lens-review-record-store";
import { normalizeLensAnnotationPayload } from "../src/lib/lens/lens-annotation-schema";
import type { LensReviewRecord } from "../src/lib/lens/lens-review-record";

/** The Lens session main would read: its document and its address. */
const session = { documentId: "document-1", url: "http://localhost:5173/settings" };
const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
const root = mkdtempSync(path.join(tmpdir(), "stave-lens-ipc-"));
let store: LensReviewRecordStore;

mock.module("electron", () => ({ ipcMain: { handle: (channel: string, run: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, run) } }));
mock.module("../electron/main/window", () => ({ getMainWindow: () => ({ webContents: {} }) }));
mock.module("../electron/main/ipc/lens-ipc-authorization", () => ({ isTrustedLensRenderer: () => true }));
mock.module("../electron/main/browser/browser-automation-control", () => ({ getLensAutomation: () => ({}), pauseLensAutomation: () => ({}) }));
mock.module("../electron/main/browser/browser-review", () => ({ compareLensAnnotation: async () => ({ ok: true }) }));
mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => ({ lensReviewRecords: store }) }));
mock.module("../electron/main/browser/browser-manager", () => ({
  resolvePreferredBrowserSession: () => undefined,
  getBrowserSession: () => ({ documentId: session.documentId, webContents: { isDestroyed: () => false, getURL: () => session.url } }),
}));

const { registerLensReviewHandlers } = await import("../electron/main/ipc/lens-review");
registerLensReviewHandlers();

const annotation = normalizeLensAnnotationPayload(
  { id: "annotation-1", kind: "element", pin: 1, rect: { x: 0, y: 0, width: 100, height: 40 }, comment: "Increase contrast", selector: "#action", createdAt: "2026-10-22T00:00:00Z" },
  { documentId: "sent-document", url: "http://localhost:5173/settings", title: "Settings" },
);
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64")}`;
const call = (channel: string, input: unknown) => handlers.get(channel)!({}, input) as Promise<{ ok: boolean; code?: string; record?: LensReviewRecord; records?: LensReviewRecord[] }>;
const save = () => call("lens:review-records:save", {
  taskId: "task-1", workspaceId: "workspace-1", lensSessionId: "lens-1", annotation, beforeImageId: "lens-comment-image:workspace-1:lens-1:annotation-1",
  documentId: "document-1", afterDataUrl: PNG, verdict: "confirmed",
});
const list = async () => (await call("lens:review-records:list", { taskId: "task-1" })).records ?? [];

beforeEach(() => {
  store = new LensReviewRecordStore(new Database(":memory:"), root);
  session.documentId = "document-1";
  session.url = "http://localhost:5173/settings";
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("Lens review record IPC", () => {
  test("a confirmation stands while the session shows the same document and address", async () => {
    expect((await save()).ok).toBe(true);
    expect((await list()).map((record) => record.verdict)).toEqual(["confirmed"]);
  });

  test("a same-document navigation to another address reads as needing a re-check", async () => {
    expect((await save()).ok).toBe(true);
    // pushState: the document stays, the address changes.
    session.url = "http://localhost:5173/billing";
    expect((await list()).map((record) => [record.verdict, record.recheckReason])).toEqual([["needs-recheck", "page-changed"]]);
  });

  test("a capture cannot confirm after the address changed, and a record cannot be confirmed there", async () => {
    session.url = "http://localhost:5173/billing";
    expect(await save()).toMatchObject({ ok: false, code: "page-changed" });
    session.url = "http://localhost:5173/settings";
    const saved = await call("lens:review-records:save", {
      taskId: "task-1", workspaceId: "workspace-1", lensSessionId: "lens-1", annotation, beforeImageId: "x", documentId: "document-1", afterDataUrl: PNG, verdict: "needs-recheck",
    });
    session.url = "http://localhost:5173/billing";
    expect(await call("lens:review-records:set-verdict", { id: saved.record!.id, verdict: "confirmed" })).toMatchObject({ ok: false, code: "page-changed" });
  });
});
