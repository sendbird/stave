import { describe, expect, it } from "bun:test";
import {
  LENS_CAPTURE_LIMITS,
  LENS_REDACTED_VALUE,
  LENS_UNTRUSTED_PAGE_EVIDENCE,
  normalizeLensAnnotationEventPayload,
  normalizeLensAnnotationPayload,
  normalizeLensElementPickerResult,
} from "@/lib/lens/lens-annotation-schema";
import {
  LensAnnotationRemoveArgsSchema,
  LensAnnotationStyleArgsSchema,
  LensScreenshotArgsSchema,
} from "../electron/main/ipc/schemas";

const context = {
  documentId: "document-current",
  url: "https://example.com/review?session=private#details",
  title: "Review page",
};

function currentAnnotationPayload() {
  return {
    id: "annotation-1",
    kind: "element",
    pin: 1,
    rect: { x: 32, y: 64, width: 180, height: 44 },
    comment: "Button is cramped",
    createdAt: "2026-07-26T00:00:00.000Z",
    selector: "#hero > button",
    tagName: "button",
    elementId: "launch",
    classList: ["button", "button--primary"],
    computedStyles: { fontSize: "14px" },
    outerHTML: '<button id="launch" value="private">Launch</button>',
    textContent: "Launch",
    styleEdits: [],
  };
}

function enrichedAnnotationPayload() {
  return {
    ...currentAnnotationPayload(),
    review: {
      page: {
        url: context.url,
        title: context.title,
        viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
        scroll: { x: 0, y: 480 },
        documentId: context.documentId,
      },
      anchor: {
        selector: "#hero > button",
        bounds: { x: 32, y: 64, width: 180, height: 44 },
        element: {
          tagName: "button",
          id: "launch",
          classList: ["button", "button--primary"],
        },
        accessibleName: "Launch",
        role: "button",
        attributes: {
          "aria-label": "api_key=<redact-me>",
          "data-testid": "launch-button",
          value: "must-not-survive",
          onclick: "must-not-survive",
        },
        ancestors: [
          {
            tagName: "section",
            selector: "#hero",
            accessibleName: "Hero",
            role: "region",
            text: "Ship your next release",
          },
        ],
        nearby: [
          {
            relation: "next",
            tagName: "a",
            selector: "#learn-more",
            accessibleName: "Learn more",
            role: "link",
            text: "Learn more",
          },
        ],
        computedStyles: { fontSize: "14px" },
        outerHTML:
          '<button id="launch" value="must-not-survive">Launch</button>',
        textContent: "Launch",
        componentNameChain: ["App", "Hero", "Button"],
      },
      evidence: {
        screenshot: {
          kind: "clipped",
          bounds: { x: 32, y: 64, width: 180, height: 44 },
        },
        styleEdits: [],
      },
      feedback: {
        comment: "Button is cramped",
        intent: "fix",
        priority: "high",
      },
      trust: LENS_UNTRUSTED_PAGE_EVIDENCE,
    },
  };
}

describe("Lens annotation normalization", () => {
  it("upgrades the current payload shape with bounded defaults", () => {
    const annotation = normalizeLensAnnotationPayload(
      currentAnnotationPayload(),
      context,
    );

    expect(annotation.comment).toBe("Button is cramped");
    expect(annotation.review.feedback).toEqual({
      comment: "Button is cramped",
      intent: "fix",
      priority: "medium",
    });
    expect(annotation.review.page).toEqual({
      url: "https://example.com/review",
      title: "Review page",
      viewport: { width: 0, height: 0, devicePixelRatio: 1 },
      scroll: { x: 0, y: 0 },
      documentId: "document-current",
    });
    expect(annotation.review.trust).toBe(LENS_UNTRUSTED_PAGE_EVIDENCE);
  });

  it("keeps only safe attributes and redacts secret-like evidence", () => {
    const payload = enrichedAnnotationPayload();
    payload.review.anchor.textContent = "access_token=<redact-me>";
    const annotation = normalizeLensAnnotationPayload(
      payload,
      {
        ...context,
        requireDocumentIdentity: true,
      },
    );

    expect(annotation.review.anchor.attributes).toEqual({
      "aria-label": LENS_REDACTED_VALUE,
      "data-testid": "launch-button",
    });
    expect(annotation.review.anchor.outerHTML).not.toContain("value=");
    expect(annotation.review.anchor.outerHTML).toContain(
      `<button id="launch">${LENS_REDACTED_VALUE}</button>`,
    );
    expect(annotation.review.anchor.textContent).toBe(LENS_REDACTED_VALUE);
  });

  it("bounds strings and collections deterministically", () => {
    const payload = enrichedAnnotationPayload();
    payload.comment = "x".repeat(LENS_CAPTURE_LIMITS.commentBytes * 2);
    payload.review.feedback.comment = payload.comment;
    payload.classList = Array.from(
      { length: LENS_CAPTURE_LIMITS.classListItems + 5 },
      (_, index) => `class-${index}`,
    );
    payload.review.anchor.element.classList = payload.classList;
    payload.review.anchor.nearby = Array.from(
      { length: LENS_CAPTURE_LIMITS.nearbyItems + 5 },
      (_, index) => ({
        relation: "next",
        tagName: "span",
        text: `Nearby ${index}`,
      }),
    );

    const annotation = normalizeLensAnnotationPayload(payload, {
      ...context,
      requireDocumentIdentity: true,
    });

    expect(
      new TextEncoder().encode(annotation.comment).byteLength,
    ).toBeLessThanOrEqual(LENS_CAPTURE_LIMITS.commentBytes);
    expect(annotation.classList).toHaveLength(
      LENS_CAPTURE_LIMITS.classListItems,
    );
    expect(annotation.review.anchor.nearby).toHaveLength(
      LENS_CAPTURE_LIMITS.nearbyItems,
    );
  });

  it("rejects malformed numbers, unsafe URLs, and unknown fields", () => {
    expect(() =>
      normalizeLensAnnotationPayload(
        {
          ...enrichedAnnotationPayload(),
          rect: { x: Number.NaN, y: 0, width: 1, height: 1 },
        },
        { ...context, requireDocumentIdentity: true },
      ),
    ).toThrow(/invalid lens annotation/i);

    const unsafe = enrichedAnnotationPayload();
    unsafe.review.page.url = "javascript:alert(1)";
    expect(() =>
      normalizeLensAnnotationPayload(unsafe, {
        ...context,
        requireDocumentIdentity: true,
      }),
    ).toThrow(/protocol/i);

    expect(() =>
      normalizeLensAnnotationPayload(
        { ...enrichedAnnotationPayload(), unexpected: true },
        { ...context, requireDocumentIdentity: true },
      ),
    ).toThrow(/invalid lens annotation/i);
  });

  it("rejects stale document identities and page ownership mismatches", () => {
    const stale = enrichedAnnotationPayload();
    stale.review.page.documentId = "document-stale";
    expect(() =>
      normalizeLensAnnotationPayload(stale, {
        ...context,
        requireDocumentIdentity: true,
      }),
    ).toThrow(/stale document/i);

    const wrongPage = enrichedAnnotationPayload();
    wrongPage.review.page.url = "https://elsewhere.example/review";
    expect(() =>
      normalizeLensAnnotationPayload(wrongPage, {
        ...context,
        requireDocumentIdentity: true,
      }),
    ).toThrow(/page ownership/i);
  });

  it("normalizes only document-owned annotation events", () => {
    const event = normalizeLensAnnotationEventPayload(
      {
        type: "add",
        documentId: context.documentId,
        annotation: enrichedAnnotationPayload(),
      },
      context,
    );
    expect(event.annotation?.review.page.documentId).toBe(context.documentId);

    expect(() =>
      normalizeLensAnnotationEventPayload(
        {
          type: "clear",
          documentId: "document-stale",
        },
        context,
      ),
    ).toThrow(/stale document/i);

    expect(() =>
      normalizeLensAnnotationEventPayload(
        {
          type: "add",
          documentId: context.documentId,
        },
        context,
      ),
    ).toThrow(/annotation is required/i);
  });

  it("normalizes enriched element-picker evidence against the current page", () => {
    const payload = enrichedAnnotationPayload();
    const result = normalizeLensElementPickerResult(
      {
        selector: payload.selector,
        tagName: payload.tagName,
        id: payload.elementId,
        classList: payload.classList,
        boundingBox: payload.rect,
        computedStyles: payload.computedStyles,
        outerHTML: payload.outerHTML,
        textContent: payload.textContent,
        page: payload.review.page,
        anchor: payload.review.anchor,
        trust: payload.review.trust,
      },
      {
        ...context,
        requireDocumentIdentity: true,
      },
    );

    expect(result.page.url).toBe("https://example.com/review");
    expect(result.anchor.accessibleName).toBe("Launch");
    expect(result.trust).toBe(LENS_UNTRUSTED_PAGE_EVIDENCE);
  });
});

describe("Lens annotation IPC schemas", () => {
  it("keeps screenshot and mutation requests strict and finite", () => {
    expect(
      LensScreenshotArgsSchema.safeParse({
        workspaceId: "workspace-1",
        lensSessionId: "lens-a",
        options: {
          documentId: "document-current",
          clip: { x: 0, y: 0, width: 100, height: 40 },
        },
      }).success,
    ).toBe(true);
    expect(
      LensScreenshotArgsSchema.safeParse({
        workspaceId: "workspace-1",
        options: {
          clip: { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 40 },
        },
      }).success,
    ).toBe(false);
    expect(
      LensAnnotationRemoveArgsSchema.safeParse({
        workspaceId: "workspace-1",
        annotationId: "annotation-1",
        documentId: "document-current",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      LensAnnotationRemoveArgsSchema.safeParse({
        workspaceId: "workspace-1",
        annotationId: "annotation-1",
      }).success,
    ).toBe(false);
    expect(
      LensAnnotationStyleArgsSchema.safeParse({
        workspaceId: "workspace-1",
        annotationId: "annotation-1",
        selector: "#launch",
        patch: { fontSize: "16px" },
        documentId: "document-current",
      }).success,
    ).toBe(true);
  });
});
