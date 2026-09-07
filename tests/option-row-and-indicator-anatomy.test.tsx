import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@/components/ads/components/Button";
import {
  ComposerOptionCard,
  ComposerOptionModelRow,
} from "@/components/ai-elements/composer-option-menu";
import { CountBadge } from "@/components/system/CountBadge";

/*
 * These assert ANATOMY, not classes. StyleX class names are content hashes and
 * the compiler does not run over `tests/`, so a class assertion here would pin
 * a hash rather than a contract. What each defect actually was is structural:
 * the selected mark was rendered inside (or after) the label flow instead of in
 * the row's trailing track, and a corner badge was a positioned child of a
 * clipping button instead of the button's own indicator slot. Structure is what
 * these pin; the geometry is measured in the browser.
 */

function lastElementChildTagOfRoot(markup: string) {
  // The trailing `</span></button>` shape: the mark is the row's LAST child,
  // outside the copy column.
  return markup.trimEnd().endsWith("</span></button>");
}

describe("composer option rows", () => {
  test("a selected two-line card puts its mark after the copy column", () => {
    const markup = renderToStaticMarkup(
      <ComposerOptionCard
        active
        label="Verified patch"
        summary="Plans, patches, then verifies"
        onSelect={() => {}}
      />,
    );
    const labelAt = markup.indexOf("Verified patch");
    const summaryAt = markup.indexOf("Plans, patches, then verifies");
    const markAt = markup.indexOf("<svg");
    expect(labelAt).toBeGreaterThan(-1);
    expect(summaryAt).toBeGreaterThan(labelAt);
    // The check follows BOTH lines of copy. When it was rendered outside the
    // row's flex/grid box it wrapped onto its own line under the label.
    expect(markAt).toBeGreaterThan(summaryAt);
    expect(lastElementChildTagOfRoot(markup)).toBe(true);
  });

  test("an unselected card renders no mark at all", () => {
    const markup = renderToStaticMarkup(
      <ComposerOptionCard
        active={false}
        label="Verified patch"
        summary="Plans, patches, then verifies"
        onSelect={() => {}}
      />,
    );
    expect(markup).not.toContain("<svg");
  });

  test("the model row is the same anatomy as the card", () => {
    const markup = renderToStaticMarkup(
      <ComposerOptionModelRow
        active
        label="Auto"
        description="Resolves to the preset's model"
        onSelect={() => {}}
      />,
    );
    const labelAt = markup.indexOf("Auto");
    const descriptionAt = markup.indexOf("Resolves to the preset");
    expect(descriptionAt).toBeGreaterThan(labelAt);
    expect(markup.indexOf("<svg")).toBeGreaterThan(descriptionAt);
    expect(lastElementChildTagOfRoot(markup)).toBe(true);
  });
});

describe("Button indicator slot", () => {
  test("renders the mark as the button's last child", () => {
    const markup = renderToStaticMarkup(
      <Button aria-label="tasks" indicator={<CountBadge count={4} />}>
        <svg />
      </Button>,
    );
    expect(markup).toContain(">4<");
    expect(markup.indexOf("</svg>")).toBeLessThan(markup.indexOf(">4<"));
    expect(lastElementChildTagOfRoot(markup)).toBe(true);
  });

  test("a busy button shows the spinner instead of the mark", () => {
    const markup = renderToStaticMarkup(
      <Button aria-label="tasks" loading indicator={<CountBadge count={4} />}>
        <svg />
      </Button>,
    );
    expect(markup).not.toContain(">4<");
  });
});

describe("CountBadge", () => {
  test("shows a count literally and caps it above the cap", () => {
    expect(renderToStaticMarkup(<CountBadge count={7} />)).toContain(">7<");
    expect(renderToStaticMarkup(<CountBadge count={99} />)).toContain(">99<");
    expect(renderToStaticMarkup(<CountBadge count={100} />)).toContain(">99+<");
    expect(renderToStaticMarkup(<CountBadge cap={9} count={12} />)).toContain(
      ">9+<",
    );
  });
});
