import { describe, expect, it } from "bun:test";
import { getAnnotationOverlayScript } from "../electron/main/browser/browser-annotation-overlay";
import { getElementPickerScript } from "../electron/main/browser/browser-element-picker";
import {
  executeInLensAnnotationWorld,
  LENS_ANNOTATION_WORLD_ID,
} from "../electron/main/browser/browser-annotation-world";

describe("Lens annotation guest scripts", () => {
  it("builds a syntactically valid annotation overlay with review metadata", () => {
    const script = getAnnotationOverlayScript({
      documentId: "document-1",
      extractDebugSource: true,
      nonce: "nonce-1",
    });

    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("untrusted-page-evidence");
    expect(script).toContain("staveAccessibleName");
    expect(script).toContain("staveSafeAttributes");
    expect(script).toContain("__staveReconcileAnnotations");
    expect(script).toContain("Visual comment intent");
    expect(script).toContain("Visual comment priority");
    expect(script).toContain('attachShadow({ mode: "closed" })');
    expect(script).toContain("event.isTrusted");
    expect(script).toContain('panel.setAttribute("role", "dialog")');
  });

  it("builds a syntactically valid element picker with page context", () => {
    const script = getElementPickerScript({
      documentId: "document-1",
      extractDebugSource: true,
    });

    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("stavePageIdentity(documentId)");
    expect(script).toContain("staveElementContext");
    expect(script).toContain("untrusted-page-evidence");
  });

  it("executes annotation controls in a dedicated isolated world", async () => {
    let capturedWorldId = 0;
    let capturedCode = "";
    const result = await executeInLensAnnotationWorld<string>(
      {
        executeJavaScriptInIsolatedWorld: async (worldId, sources) => {
          capturedWorldId = worldId;
          capturedCode = sources[0]?.code ?? "";
          return "ok";
        },
      },
      "window.__staveGetAnnotations?.() ?? []",
    );

    expect(result).toBe("ok");
    expect(capturedWorldId).toBe(LENS_ANNOTATION_WORLD_ID);
    expect(capturedCode).toContain("__staveGetAnnotations");
  });
});
