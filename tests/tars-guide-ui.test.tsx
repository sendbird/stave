import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsGuide } from "../src/components/tars/TarsGuide";
import { TarsMark } from "../src/components/tars/TarsMark";
import enShell from "../src/locales/en/shell.json";
import koShell from "../src/locales/ko/shell.json";

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("Tars guide", () => {
  test("the overview exposes three steps and essential conditions, with optional request examples", () => {
    const plain = renderToStaticMarkup(createElement(TarsGuide));
    expect(plain).toContain(enShell.tars.guide.summary);
    for (const n of [1, 2, 3]) {
      expect(plain).toContain(enShell.tars.guide[`step${n}Title` as keyof typeof enShell.tars.guide]);
      expect(plain).toContain(enShell.tars.guide[`step${n}Text` as keyof typeof enShell.tars.guide]);
    }
    for (const n of [1, 2]) expect(plain).toContain(enShell.tars.guide[`limit${n}` as keyof typeof enShell.tars.guide]);
    for (const n of [3, 4, 5, 6]) expect(plain).not.toContain(enShell.tars.guide[`limit${n}` as keyof typeof enShell.tars.guide]);
    expect(plain).toContain('aria-expanded="false"');
    expect(plain).toContain(enShell.tars.guide.detailsTitle);
    expect(plain).not.toContain("data-tars-guide-examples");
    const withExamples = renderToStaticMarkup(createElement(TarsGuide, { onExample: () => {} }));
    expect(withExamples.indexOf("data-tars-guide-steps")).toBeLessThan(withExamples.indexOf("data-tars-guide-examples"));
    for (const n of [1, 2, 3]) expect(withExamples).toContain(enShell.tars.guide[`exampleLabel${n}` as keyof typeof enShell.tars.guide]);
    expect(withExamples).toContain(`title="${enShell.tars.guide.example2}"`);
  });

  test("Korean copy renders with the same keys", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const html = renderToStaticMarkup(createElement(TarsGuide, { onExample: () => {} }));
    expect(html).toContain(koShell.tars.guide.summary);
    expect(html).toContain(koShell.tars.guide.exampleLabel1);
    expect(Object.keys(koShell.tars.guide).sort()).toEqual(Object.keys(enShell.tars.guide).sort());
  });

  test("the mark is a decorative currentColor icon in the 24 box", () => {
    const html = renderToStaticMarkup(createElement(TarsMark));
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/fill="#|stroke="#/);
  });
});
