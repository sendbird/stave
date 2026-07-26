import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagedTaskTakeoverNotice } from "@/components/session/ManagedTaskTakeoverNotice";

describe("ManagedTaskTakeoverNotice", () => {
  test("offers a direct takeover action after the managed run ends", () => {
    const html = renderToStaticMarkup(
      createElement(ManagedTaskTakeoverNotice, {
        owner: "stave",
        isTurnActive: false,
        canTakeOver: true,
        onTakeOver: () => {},
      }),
    );

    expect(html).toContain("Managed by Stave");
    expect(html).toContain("Take Over");
    expect(html).toContain('aria-label="Take over managed task"');
    expect(html).not.toContain(' disabled=""');
  });

  test("keeps takeover visible but disabled while the run is active", () => {
    const html = renderToStaticMarkup(
      createElement(ManagedTaskTakeoverNotice, {
        owner: "external",
        isTurnActive: true,
        canTakeOver: false,
        onTakeOver: () => {},
      }),
    );

    expect(html).toContain("Managed externally");
    expect(html).toContain("unlocks when it stops");
    expect(html).toContain(' disabled=""');
  });
});
