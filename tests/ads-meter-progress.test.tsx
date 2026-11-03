import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Meter } from "../src/components/ads/components/Meter";
import { Progress } from "../src/components/ads/components/Progress";
import { Reasons } from "../src/components/results/ResultsParts";
import { applyAppLocale } from "../src/i18n";

describe("Meter", () => {
  test("is a named meter whose value and words reach assistive technology", () => {
    const html = renderToStaticMarkup(createElement(Meter, {
      label: "Weekly limit", value: 42, tone: "warning", size: "sm", hideLabel: true, hideValue: true,
      getAriaValueText: () => "42% used",
    }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-valuetext="42% used"');
    expect(html).toContain('data-tone="warning"');
    // The name stays in the tree even though it is not drawn.
    expect(html).toContain(">Weekly limit</span>");
    // hideValue drops the drawn figure; the value text is still on the root.
    expect(html).not.toContain(">42%<");
  });

  test("a neutral reading and a raw-unit range keep their own bounds", () => {
    const html = renderToStaticMarkup(createElement(Meter, { label: "Turns", value: 3, min: 0, max: 40, tone: "neutral" }));
    expect(html).toContain('aria-valuemax="40"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('data-tone="neutral"');
  });
});

describe("Progress", () => {
  test("a determinate bar reads its ratio, not its raw value, and can hide its header", () => {
    const html = renderToStaticMarkup(createElement(Progress, {
      label: "Stage progress", value: 2, max: 3, hideLabel: true, hideValue: true, size: "sm",
      getAriaValueText: () => "Stage 2 of 3",
    }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).toContain('aria-valuetext="Stage 2 of 3"');
    expect(html).toContain(">Stage progress</span>");
    expect(html).toContain("inline-size:66.66666666666666%");
  });
});

describe("run stop reasons", () => {
  test("each reason is a meter with its name and count, not a hidden bar", () => {
    applyAppLocale("en");
    const html = renderToStaticMarkup(createElement(Reasons, {
      summary: { reasons: [{ reason: "expired", count: 1 }, { reason: "stopped-by-you", count: 3 }] } as never,
    }));
    expect(html.match(/role="meter"/g)).toHaveLength(2);
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain("3 of 4 runs, 75%");
  });
});
