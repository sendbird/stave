import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ActivityTimestamp } from "@/components/system/ActivityTimestamp";

afterEach(() => applyAppLocale("en"));

describe("activity timestamps", () => {
  test("shows an old task's year and exact timestamp in both display languages", () => {
    const value = "2024-01-02T03:04:05.000Z";
    for (const locale of ["en", "ko"] as const) {
      applyAppLocale(locale);
      const markup = renderToStaticMarkup(createElement(ActivityTimestamp, { value, kind: "updated" }));
      expect(markup.toLowerCase()).toContain(`datetime="${value.toLowerCase()}"`);
      expect(markup).toContain("2024");
      expect(markup).toContain(locale === "en" ? "Last updated" : "마지막 수정");
      expect(markup).toContain("title=");
    }
  });

  test("does not invent a timestamp for missing or malformed legacy data", () => {
    for (const value of [undefined, "", "invalid-date"]) {
      expect(renderToStaticMarkup(createElement(ActivityTimestamp, { value, kind: "sent" }))).toBe("");
    }
  });

  test("distinguishes a sent message, a running response and a completed response", () => {
    for (const [kind, label] of [["sent", "Sent"], ["started", "Started"], ["completed", "Responded"]] as const) {
      const markup = renderToStaticMarkup(createElement(ActivityTimestamp, { value: "2025-12-31T23:59:00Z", kind }));
      expect(markup).toContain(label);
      expect(markup).not.toContain("Invalid Date");
    }
  });
});
