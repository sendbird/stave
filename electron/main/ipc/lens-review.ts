import { ipcMain } from "electron";
import { LensSessionTargetArgsSchema } from "./schemas";
import { z } from "zod";
import { PersistedLensAnnotationSchema } from "../../../src/lib/lens/lens-annotation-schema";
import { getBrowserSession, resolvePreferredBrowserSession } from "../browser/browser-manager";
import { getLensAutomation, pauseLensAutomation } from "../browser/browser-automation-control";
import { compareLensAnnotation } from "../browser/browser-review";
import { getMainWindow } from "../window";
import { isTrustedLensRenderer } from "./lens-ipc-authorization";

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
}
