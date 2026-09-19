import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { comparisonScript } from "@/lib/lens/lens-feedback-comparison";
import { normalizeLensAnnotationPayload } from "@/lib/lens/lens-annotation-schema";

const annotation = normalizeLensAnnotationPayload({
  createdAt: "2026-09-20T00:00:00Z", id: "target", kind: "element", pin: 1, selector: "#action", tagName: "button",
  rect: { x: 5, y: 5, width: 100, height: 40 }, comment: "Make it clearer",
}, { documentId: "before", url: "https://example.com/page", title: "Page" });
annotation.review.page.viewport = { width: 800, height: 600, devicePixelRatio: 1 };
annotation.review.anchor.element = { tagName: "button", id: "action", classList: [] };
const element = { tagName: "BUTTON", id: "action", getBoundingClientRect: () => ({ x: 10, y: 10, width: 100, height: 40 }) };
function compare(options: Record<string, unknown> = {}, nodes: unknown[] = [element]) {
  return runInNewContext(comparisonScript(annotation), { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0, document: { querySelectorAll: () => nodes }, ...options });
}
describe("Lens comparison evidence", () => {
  test("captures a unique visible target at the original viewport", () => {
    expect(compare().rect).toEqual({ x: 10, y: 10, width: 100, height: 40 });
  });
  test("does not silently compare a missing, ambiguous or replaced target", () => {
    expect(compare({}, []).error).toContain("missing or ambiguous");
    expect(compare({}, [element, element]).error).toContain("missing or ambiguous");
    expect(compare({}, [{ ...element, id: "different" }]).error).toContain("identity changed");
  });
  test("requires matching viewport and a fully visible target", () => {
    expect(compare({ innerWidth: 400 }).error).toContain("viewport");
    expect(compare({ devicePixelRatio: 2 }).error).toContain("viewport");
    expect(compare({}, [{ ...element, getBoundingClientRect: () => ({ x: -1, y: 0, width: 100, height: 40 }) }]).error).toContain("Scroll");
  });
});
