import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReasoningText } from "@/components/ai-elements/reasoning-text";

/* These are `renderToStaticMarkup` substring assertions — there is no DOM
   runner in this repo, so only the initial (server) render is observable. */

describe("ReasoningText", () => {
  test("reserves the widest phrase so rotation cannot resize the label", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      phrases: ["Ok", "A much longer phrase"],
      active: true,
    }));

    /* The invisible anchor holds the longest phrase; the live phrase is the
       first pool entry on the initial render. */
    expect(html).toContain("invisible");
    expect(html).toContain("A much longer phrase");
    expect(html).toContain("col-start-1");
    expect(html).toContain("row-start-1");
  });

  test("cascade splits the phrase into per-character animation slots", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Abc",
      variant: "cascade",
      active: true,
    }));

    expect(html).toContain("motion-safe:animate-cascade-char");
    expect(html).toContain("--cascade-i:0");
    expect(html).toContain("--cascade-i:1");
    expect(html).toContain("--cascade-i:2");
  });

  test("swap renders a single span with no per-character slots", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Abc",
      variant: "swap",
      active: true,
    }));

    expect(html).not.toContain("animate-cascade-char");
    expect(html).toContain("motion-safe:animate-thinking-phrase-soft");
  });

  test("scramble renders the settled phrase before the rAF loop starts", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Reticulating",
      variant: "scramble",
      active: true,
    }));

    expect(html).toContain("Reticulating");
  });

  test("shimmer keeps the gradient on one surface spanning the whole phrase", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Abc",
      variant: "cascade",
      shimmer: true,
      active: true,
    }));

    /* One shimmer surface, not one per character. */
    expect(html.match(/bg-clip-text/g)?.length ?? 0).toBe(1);
    expect(html).toContain("--shimmer-base-color");
  });

  test("renders the indicator before the phrase", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Abc",
      variant: "swap",
      indicator: createElement("i", { "data-testid": "indicator" }),
    }));

    expect(html.indexOf("data-testid=\"indicator\"")).toBeLessThan(html.indexOf("Abc"));
  });
});
