import { describe, expect, it } from "bun:test";
import {
  applyLensAnnotationEvent,
  invalidateLensAnnotationDocument,
  type LensAnnotationDocumentState,
} from "../electron/main/browser/browser-annotation-state";
import {
  LENS_ANNOTATION_BEACON_MARKER,
  readLensAnnotationConsoleMessage,
} from "../electron/main/browser/browser-annotation-ingestion";
import type { BrowserSessionState } from "../electron/main/browser/browser-manager";
import {
  LENS_UNTRUSTED_PAGE_EVIDENCE,
  normalizeLensAnnotationPayload,
} from "@/lib/lens/lens-annotation-schema";

function annotation(documentId: string) {
  return normalizeLensAnnotationPayload(
    {
      id: "annotation-1",
      kind: "area",
      pin: 1,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      comment: "Align this region",
      createdAt: "2026-07-26T00:00:00.000Z",
      review: {
        page: {
          url: "https://example.com/path",
          title: "Example",
          viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
          scroll: { x: 0, y: 0 },
          documentId,
        },
        anchor: {
          bounds: { x: 10, y: 20, width: 30, height: 40 },
          attributes: {},
          ancestors: [],
          nearby: [],
          computedStyles: {},
        },
        evidence: {
          screenshot: {
            kind: "clipped",
            bounds: { x: 10, y: 20, width: 30, height: 40 },
          },
          styleEdits: [],
        },
        feedback: {
          comment: "Align this region",
          intent: "change",
          priority: "medium",
        },
        trust: LENS_UNTRUSTED_PAGE_EVIDENCE,
      },
    },
    {
      documentId,
      url: "https://example.com/path",
      title: "Example",
      requireDocumentIdentity: true,
    },
  );
}

function state(): LensAnnotationDocumentState {
  return {
    documentId: "document-old",
    annotationNonce: "nonce-old",
    annotations: [annotation("document-old")],
  };
}

function browserSession(): BrowserSessionState {
  return {
    documentId: "document-old",
    annotationNonce: "nonce-old",
    webContents: {
      getURL: () => "https://example.com/path",
      getTitle: () => "Example",
    },
    navigationState: {
      url: "https://example.com/path",
      title: "Example",
    },
  } as unknown as BrowserSessionState;
}

describe("Lens annotation document state", () => {
  it("clears annotations and rotates identity on a new document", () => {
    const current = state();
    const changed = invalidateLensAnnotationDocument(current, {
      documentId: "document-new",
      annotationNonce: "nonce-new",
    });

    expect(changed).toBe(true);
    expect(current.documentId).toBe("document-new");
    expect(current.annotationNonce).toBe("nonce-new");
    expect(current.annotations).toEqual([]);
  });

  it("preserves same-document state", () => {
    const current = state();
    const changed = invalidateLensAnnotationDocument(current, {
      documentId: "document-old",
      annotationNonce: "nonce-new",
    });

    expect(changed).toBe(false);
    expect(current.annotationNonce).toBe("nonce-old");
    expect(current.annotations).toHaveLength(1);
  });

  it("ignores stale events before mutating session state", () => {
    const current = state();
    const applied = applyLensAnnotationEvent(current, {
      type: "clear",
      documentId: "document-stale",
    });

    expect(applied).toBe(false);
    expect(current.annotations).toHaveLength(1);
  });

  it("applies current-document events", () => {
    const current = state();
    const applied = applyLensAnnotationEvent(current, {
      type: "remove",
      documentId: "document-old",
      annotation: annotation("document-old"),
    });

    expect(applied).toBe(true);
    expect(current.annotations).toEqual([]);
  });

  it("consumes stale annotation beacons without exposing them as page logs", () => {
    const result = readLensAnnotationConsoleMessage(
      browserSession(),
      `${LENS_ANNOTATION_BEACON_MARKER}nonce-stale{"type":"clear"}`,
    );

    expect(result).toEqual({ recognized: true });
  });

  it("parses only bounded events carrying the current nonce", () => {
    const current = browserSession();
    const result = readLensAnnotationConsoleMessage(
      current,
      `${LENS_ANNOTATION_BEACON_MARKER}nonce-old${JSON.stringify({
        type: "clear",
        documentId: "document-old",
      })}`,
    );

    expect(result.recognized).toBe(true);
    expect(result.event).toEqual({
      type: "clear",
      documentId: "document-old",
    });
    expect(() =>
      readLensAnnotationConsoleMessage(
        current,
        `${LENS_ANNOTATION_BEACON_MARKER}nonce-old${"x".repeat(256_001)}`,
      ),
    ).toThrow(/capture limit/i);
  });
});
