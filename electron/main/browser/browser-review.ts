import { comparisonScript } from "../../../src/lib/lens/lens-feedback-comparison";
import type { LensAnnotation } from "../../../src/lib/lens/lens.types";
import { sanitizeLensPageUrl } from "../../../src/lib/lens/lens-annotation-schema";
import { captureScreenshot, evaluateExpression } from "./browser-cdp";
import type { BrowserSessionState } from "./browser-manager";

export async function compareLensAnnotation(session: BrowserSessionState, annotation: LensAnnotation) {
  const documentId = session.documentId;
  if (sanitizeLensPageUrl(session.webContents.getURL()) !== annotation.review.page.url)
    throw new Error("Open the captured page before comparing.");
  const result = await evaluateExpression(session.webContents.id, comparisonScript(annotation)) as {
    error?: string;
    rect?: { x: number; y: number; width: number; height: number };
  };
  if (result.error || !result.rect) throw new Error(result.error ?? "Select the target again.");
  if (session.documentId !== documentId) throw new Error("The page changed. Compare again.");
  const dataUrl = await captureScreenshot(session.webContents.id, { clip: result.rect });
  const after = await evaluateExpression(session.webContents.id, comparisonScript(annotation)) as typeof result;
  if (after.error || JSON.stringify(after.rect) !== JSON.stringify(result.rect))
    throw new Error("The target moved during capture. Compare again.");
  if (session.documentId !== documentId) throw new Error("The page changed. Compare again.");
  return { ok: true, dataUrl, documentId };
}
