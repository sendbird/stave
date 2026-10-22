import { ipcMain } from "electron";
import { LensSessionTargetArgsSchema } from "./schemas";
import { z } from "zod";
import { PersistedLensAnnotationSchema } from "../../../src/lib/lens/lens-annotation-schema";
import { getBrowserSession, resolvePreferredBrowserSession } from "../browser/browser-manager";
import { getLensAutomation, pauseLensAutomation } from "../browser/browser-automation-control";
import { compareLensAnnotation } from "../browser/browser-review";
import { getMainWindow } from "../window";
import { isTrustedLensRenderer } from "./lens-ipc-authorization";
import { ensurePersistenceReady } from "../state";
import { decodeLensReviewPng, showsCapturedPage, type LensReviewRecordStore, type LensSessionPage } from "../../persistence/lens-review-record-store";
import { sanitizeLensPageUrl } from "../../../src/lib/lens/lens-annotation-schema";
import {
  ListLensReviewRecordsArgsSchema,
  ReadLensReviewImageArgsSchema,
  SaveLensReviewRecordArgsSchema,
  SetLensReviewVerdictArgsSchema,
  type LensReviewRecord,
} from "../../../src/lib/lens/lens-review-record";

const PauseSchema = LensSessionTargetArgsSchema.extend({ paused: z.boolean() }).strict();
const StateSchema = LensSessionTargetArgsSchema.extend({ includePreview: z.boolean().optional() }).strict();
const CompareSchema = LensSessionTargetArgsSchema.extend({ annotation: PersistedLensAnnotationSchema }).strict();

export function registerLensReviewHandlers() {
  function handle(channel: string, run: (input: unknown) => Promise<unknown> | unknown) {
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (!isTrustedLensRenderer(event, getMainWindow()?.webContents)) return { ok: false, message: "Unauthorized Lens renderer" };
      try { return await run(input); }
      catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Lens request failed" }; }
    });
  }
  handle("lens:get-automation", (input) => {
    const args = StateSchema.parse(input);
    const session = resolvePreferredBrowserSession(args.workspaceId, args.lensSessionId);
    if (!session) return { ok: true };
    const state = getLensAutomation(session);
    if (!args.includePreview) delete state.preview;
    return { ok: true, state };
  });
  handle("lens:set-automation-paused", (input) => {
    const args = PauseSchema.parse(input);
    const session = resolvePreferredBrowserSession(args.workspaceId, args.lensSessionId);
    if (!session) return { ok: false, message: "No browser session" };
    const state = pauseLensAutomation(session, args.paused);
    if (args.paused && !session.webContents.isDestroyed()) session.webContents.stop();
    return { ok: true, state };
  });
  handle("lens:compare-annotation", (input) => {
    const args = CompareSchema.parse(input);
    const session = getBrowserSession(args.workspaceId, args.lensSessionId);
    if (!session) return { ok: false, message: "No browser session" };
    return compareLensAnnotation(session, args.annotation);
  });
  handle("lens:review-records:list", async (input) => {
    const args = ListLensReviewRecordsArgsSchema.parse(input);
    const store = (await ensurePersistenceReady()).lensReviewRecords;
    return { ok: true, records: store.list(args).map((record) => markChangedPage(store, record)) };
  });
  handle("lens:review-records:save", async (input) => {
    const args = SaveLensReviewRecordArgsSchema.parse(input);
    const page = args.annotation.review.page;
    // A confirmation is about the document that was captured, at its address;
    // once either changed, only "needs re-check" can be recorded for it.
    if (args.verdict === "confirmed" && !showsCapturedPage(currentLensPage(args.workspaceId, args.lensSessionId), { documentId: args.documentId, pageUrl: page.url }))
      return { ok: false, code: "page-changed" };
    const afterPng = decodeLensReviewPng(args.afterDataUrl);
    if (!afterPng) return { ok: false, code: "invalid-image" };
    const record = await (await ensurePersistenceReady()).lensReviewRecords.save({
      taskId: args.taskId, workspaceId: args.workspaceId, lensSessionId: args.lensSessionId, annotationId: args.annotation.id,
      pageUrl: page.url, viewport: page.viewport, before: { imageId: args.beforeImageId }, documentId: args.documentId, verdict: args.verdict, afterPng,
    });
    return { ok: true, record };
  });
  handle("lens:review-records:set-verdict", async (input) => {
    const args = SetLensReviewVerdictArgsSchema.parse(input);
    const store = (await ensurePersistenceReady()).lensReviewRecords;
    const current = store.get(args.id);
    if (!current) return { ok: false, code: "not-found" };
    if (args.verdict === "confirmed" && !showsCapturedPage(currentLensPage(current.workspaceId, current.lensSessionId), current))
      return { ok: false, code: "page-changed", record: markChangedPage(store, current) };
    return { ok: true, record: store.setVerdict(args) ?? current };
  });
  handle("lens:review-records:read-image", async (input) => {
    const args = ReadLensReviewImageArgsSchema.parse(input);
    const bytes = await (await ensurePersistenceReady()).lensReviewRecords.readAfterImage(args.id);
    return bytes ? { ok: true, dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` } : { ok: false, code: "not-found" };
  });
}

/** The Lens session's current document and normalized address, or undefined when it is gone. */
function currentLensPage(workspaceId: string, lensSessionId: string): LensSessionPage | undefined {
  const session = getBrowserSession(workspaceId, lensSessionId);
  if (!session) return undefined;
  let url: string | null = null;
  try {
    url = session.webContents.isDestroyed() ? null : sanitizeLensPageUrl(session.webContents.getURL());
  } catch {
    url = null;
  }
  return { documentId: session.documentId, url };
}

/** A confirmation of a page the session no longer shows is kept as needing a re-check. */
function markChangedPage(store: LensReviewRecordStore, record: LensReviewRecord): LensReviewRecord {
  return store.reconcileDocument(record, currentLensPage(record.workspaceId, record.lensSessionId));
}
