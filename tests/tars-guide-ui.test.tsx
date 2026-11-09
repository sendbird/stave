import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale, i18n } from "@/i18n";
import { TarsGuide, TarsWelcome } from "../src/components/tars/TarsGuide";
import { TarsMark } from "../src/components/tars/TarsMark";
import enShell from "../src/locales/en/shell.json";
import koShell from "../src/locales/ko/shell.json";

afterEach(async () => { applyAppLocale("en"); await i18n.changeLanguage("en"); });

describe("Tars guide", () => {
  test("the welcome shows the intro, the short example chips and a closed guide disclosure", () => {
    const html = renderToStaticMarkup(createElement(TarsWelcome, { name: "Tars", onExample: () => {} }));
    expect(html).toContain("Talk with Tars");
    for (const n of [1, 2, 3]) expect(html).toContain(enShell.tars.guide[`exampleLabel${n}` as keyof typeof enShell.tars.guide].replace("'", "&#x27;"));
    // A chip carries its full request as the title; pressing it fills the composer with that text.
    expect(html).toContain(`title="${enShell.tars.guide.example2}"`);
    expect(html).toMatch(/aria-expanded="false"[^>]*data-tars-guide-toggle/);
    // The guide body is not rendered until the disclosure opens.
    expect(html).not.toContain(enShell.tars.guide.limit1);
  });

  test("the full guide lists what Tars can do and its limits; examples only with a handler", () => {
    const plain = renderToStaticMarkup(createElement(TarsGuide));
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(plain).toContain(enShell.tars.guide[`canDo${n}` as keyof typeof enShell.tars.guide].replace("'", "&#x27;"));
      expect(plain).toContain(enShell.tars.guide[`limit${n}` as keyof typeof enShell.tars.guide].replace("'", "&#x27;"));
    }
    expect(plain).not.toContain("data-tars-guide-examples");
    const withExamples = renderToStaticMarkup(createElement(TarsGuide, { onExample: () => {} }));
    // Examples lead, so the popover's first focused control is at the top of its content.
    expect(withExamples.indexOf("data-tars-guide-examples")).toBeLessThan(withExamples.indexOf(enShell.tars.guide.canDoTitle));
  });

  test("Korean copy renders with the same keys", async () => {
    applyAppLocale("ko"); await i18n.changeLanguage("ko");
    const html = renderToStaticMarkup(createElement(TarsGuide, { onExample: () => {} }));
    expect(html).toContain(koShell.tars.guide.canDoTitle);
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
