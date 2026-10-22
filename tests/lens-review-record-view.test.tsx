import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { LensReviewRecordView } from "../src/components/panes/surfaces/lens/LensReviewRecordView";
import type { LensReviewRecord } from "../src/lib/lens/lens-review-record";

const record: LensReviewRecord = {
  id: "record-1",
  taskId: "task-1",
  workspaceId: "workspace-1",
  lensSessionId: "lens-1",
  annotationId: "annotation-1",
  pageUrl: "http://localhost:5173/settings",
  viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
  before: { imageId: "lens-comment-image:workspace-1:lens-1:annotation-1" },
  afterImagePath: "lens-reviews/abc/record-1.png",
  documentId: "document-1",
  verdict: "confirmed",
  confirmedAt: "2026-10-22T09:00:00.000Z",
  capturedAt: "2026-10-22T09:00:00.000Z",
  updatedAt: "2026-10-22T09:00:00.000Z",
};
const BEFORE = "data:image/png;base64,QkVGT1JF";
const AFTER = "data:image/png;base64,QUZURVI=";

function render(next: LensReviewRecord, options: { image?: string; onVerdict?: boolean } = {}) {
  return renderToStaticMarkup(createElement(LensReviewRecordView, {
    record: next,
    image: "image" in options ? options.image : AFTER,
    original: BEFORE,
    aspectRatio: 2,
    onVerdict: options.onVerdict === false ? undefined : () => {},
  }));
}

afterEach(() => applyAppLocale("en"));

describe("saved Lens review", () => {
  test("a confirmed record shows its verdict, both images in the comparison, and can be marked for a re-check", () => {
    const markup = render(record);
    expect(markup).toContain("Confirmed as fixed");
    expect(markup).toContain(`src="${BEFORE}"`);
    expect(markup).toContain(`src="${AFTER}"`);
    expect(markup).toContain("Side by side");
    expect(markup).toContain("Mark needs re-check");
    expect(markup).not.toContain("Confirm fixed");
  });

  test("a record whose page changed says so and offers no confirmation from the old capture", () => {
    const markup = render({ ...record, verdict: "needs-recheck", recheckReason: "page-changed" });
    expect(markup).toContain("Needs re-check: the page changed after it was confirmed");
    expect(markup).not.toContain("Confirm fixed");
    expect(markup).not.toContain("Mark needs re-check");
  });

  test("a re-check the reviewer asked for can be confirmed again", () => {
    const markup = render({ ...record, verdict: "needs-recheck", recheckReason: "reviewer", confirmedAt: undefined });
    expect(markup).toContain("Marked as needing a re-check");
    expect(markup).toContain("Confirm fixed");
  });

  test("a missing capture is said, and a read-only view has no verdict actions", () => {
    const markup = render(record, { image: undefined, onVerdict: false });
    expect(markup).toContain("The saved capture is no longer available.");
    expect(markup).not.toContain("<button");
  });

  test("reads in Korean", () => {
    applyAppLocale("ko");
    const markup = render(record);
    expect(markup).toContain("수정됨으로 확인함");
    expect(markup).toContain("나란히");
    expect(markup).toContain("다시 확인 필요로 표시");
  });
});
