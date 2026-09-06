import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReasoningText } from "@/components/ai-elements/reasoning-text";
import { reasoningTextStyles } from "@/components/ai-elements/reasoning-text.styles";
import { sx } from "@/components/ads/utils/stylex";

/* These are `renderToStaticMarkup` substring assertions — there is no DOM
   runner in this repo, so only the initial (server) render is observable. */

describe("ReasoningText", () => {
  test("reserves the widest phrase so rotation cannot resize the label", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      phrases: ["Ok", "A much longer phrase"],
      active: true,
    }));

    /* The invisible anchor holds the longest phrase; the live phrase is the
       first pool entry on the initial render. StyleX hashes the class, so
       identity is checked against the compiled width-anchor style. */
    expect(html).toContain("A much longer phrase");
    const anchorClass = sx(reasoningTextStyles.widthAnchor);
    for (const token of anchorClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
    // The anchor and the live phrase share one grid cell so rotation cannot
    // resize the label.
    const bodyCellClass = sx(reasoningTextStyles.bodyCell);
    for (const token of bodyCellClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
  });

  test("cascade splits the phrase into per-character animation slots", () => {
    const html = renderToStaticMarkup(createElement(ReasoningText, {
      text: "Abc",
      variant: "cascade",
      active: true,
    }));

    // Each character is a separate animated slot carrying its stagger index.
    const cascadeClass = sx(reasoningTextStyles.cascadeChar);
    for (const token of cascadeClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
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

    const swapClass = sx(reasoningTextStyles.swapPhrase);
    // No per-character cascade slots on a swap render (the cascade stagger var
    // is the reliable signal since StyleX hashes the class names).
    expect(html).not.toContain("--cascade-i");
    for (const token of swapClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
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

    /* One shimmer surface, not one per character. The Shimmer wrapper paints a
       single gradient via one inline `background-image`; assert exactly one
       even though the phrase is split into per-character animation slots. */
    expect(html.match(/background-image:linear-gradient/g)?.length ?? 0).toBe(1);
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
