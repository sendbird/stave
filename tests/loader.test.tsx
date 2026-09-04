import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Loader, type LoaderVariant } from "@/components/ui/loader";

const VARIANTS: LoaderVariant[] = [
  "spinner",
  "dots",
  "pulse",
  "steps",
  "parallel",
  "matrix",
  "orbit",
  "ripple",
  "scan",
  "decode",
  "signal",
  "cascade",
  "route",
  "handoff",
  "sync",
  "compile",
  "vision",
  "explore",
  "verify",
  "persist",
];

describe("Loader", () => {
  test("renders every activity cadence", () => {
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(
        createElement(Loader, { variant, label: `${variant} work` }),
      );
      expect(html).toContain(`data-loader-variant="${variant}"`);
      expect(html).toContain('role="status"');
      expect(html).toContain(`aria-label="${variant} work"`);
    }
  });

  test("keeps a decorative mark silent when aria-hidden", () => {
    const html = renderToStaticMarkup(
      createElement(Loader, {
        "aria-hidden": true,
        variant: "pulse",
        size: "xs",
      }),
    );
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("aria-label");
    expect(html).toContain('data-loader-size="xs"');
  });

  test("shows the status label when requested", () => {
    const html = renderToStaticMarkup(
      createElement(Loader, {
        label: "Saving",
        showLabel: true,
        variant: "persist",
      }),
    );
    expect(html).toContain("Saving");
    expect(html).toContain('data-loader-labeled="true"');
  });
});
