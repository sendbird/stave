import { sx } from "@/components/ads/utils/stylex";
import { frameStyles } from "@/components/ai-elements/composer-frame.styles";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerFrame,
  ComposerFrameStatusBar,
  ComposerFrameWing,
} from "@/components/ai-elements/composer-frame";
import { ComposerWorkspaceBarView } from "@/components/session/composer-workspace-bar";
import {
  COMPOSER_WING_COLLAPSED_WIDTH_PX,
  COMPOSER_WING_REVEALED_WIDTH_PX,
  resolveComposerWingRevealWidth,
} from "@/hooks/use-composer-wing-reveal";

describe("ComposerFrame", () => {
  test("renders only the slots that have content", () => {
    const html = renderToStaticMarkup(
      createElement(
        ComposerFrame,
        {
          top: createElement("span", null, "Turn activity"),
          bottom: createElement("span", null, "main / worktree"),
          left: createElement(ComposerFrameWing, { side: "left" }, "Plan"),
        },
        createElement("div", { className: "prompt-input-shell" }, "Ask"),
      ),
    );

    expect(html).toContain('data-composer-frame="true"');
    expect(html).toContain('data-composer-frame-slot="top"');
    expect(html).toContain('data-composer-frame-slot="bottom"');
    expect(html).toContain('data-composer-frame-slot="left"');
    expect(html).toContain('data-composer-frame-wing="left"');
    expect(html).toContain('data-side="left"');
    // Geometry is checked in the rendered composer E2E; this checks slot wiring.
    expect(html).toContain(sx(frameStyles.leftInset));
    expect(html).toContain("composer-frame-wing");
    expect(html).not.toContain('data-composer-frame-slot="right"');
    expect(html).toContain("prompt-input-shell");
  });

  test("keeps the wing out of the row height so controls cannot resize the card", () => {
    const wing = (count: number) =>
      renderToStaticMarkup(
        createElement(
          ComposerFrame,
          {
            left: createElement(
              ComposerFrameWing,
              { side: "left" },
              ...Array.from({ length: count }, (_, index) =>
                createElement("button", { key: index, type: "button" }, "x"),
              ),
            ),
          },
          createElement("div", { className: "prompt-input-shell" }, "Ask"),
        ),
      );

    // The slot markup — the part that participates in grid sizing — is
    // identical no matter how many controls the wing holds.
    const slotOf = (html: string) =>
      html.slice(
        html.indexOf('data-composer-frame-slot="left"'),
        html.indexOf("<button"),
      );
    expect(slotOf(wing(1))).toBe(slotOf(wing(6)));
    expect(slotOf(wing(1))).toContain(sx(frameStyles.leftInset));
  });

  test("collapses to the raised card when every bar is empty", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerFrame, null, createElement("form", null, "draft")),
    );

    expect(html).toContain('data-composer-frame="true"');
    expect(html).not.toContain("data-composer-frame-slot");
    expect(html).toContain("<form>draft</form>");
  });
});

describe("ComposerWorkspaceBarView", () => {
  test("hides when there is nothing to orient by", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        projectLabel: "",
        workspaceLabel: "",
        folderLabel: "",
        branchLabel: "",
      }),
    );
    expect(html).toBe("");
  });

  test("shows project and branch, and keeps the rest in the tooltip", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        projectLabel: "stave",
        workspaceLabel: "fix-benchmark",
        folderLabel: "fix__benchmark-new-ade--12tr7n2",
        branchLabel: "fix/benchmark-new-ade",
      }),
    );

    expect(html).toContain('data-testid="composer-workspace-bar"');
    // Which codebase, which line of work — and nothing that repeats either.
    expect(html).toContain(">stave<");
    expect(html.match(/>fix\/benchmark-new-ade</g)).toHaveLength(1);
    expect(html).not.toContain(">fix-benchmark<");
    expect(html).not.toContain(">fix__benchmark-new-ade--12tr7n2<");
    expect(html).toContain(
      'title="fix/benchmark-new-ade · fix-benchmark · fix__benchmark-new-ade--12tr7n2"',
    );
  });

  test("drops the project when it only repeats the branch", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        projectLabel: "stave",
        workspaceLabel: "stave",
        folderLabel: "stave",
        branchLabel: "stave",
      }),
    );

    expect(html.match(/>stave</g)).toHaveLength(1);
    expect(html).not.toContain("composer-workspace-project");
  });

  test("falls back to the workspace name when there is no branch yet", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        projectLabel: "stave",
        workspaceLabel: "scratch",
        folderLabel: "scratch",
        branchLabel: "",
      }),
    );

    expect(html).toContain(">scratch<");
    expect(html).toContain(">stave<");
  });
});

describe("ComposerFrameStatusBar", () => {
  test("draws the shelf chrome and keeps trailing readouts to the right", () => {
    const html = renderToStaticMarkup(
      createElement(
        ComposerFrameStatusBar,
        { trailing: createElement("span", null, "Runtime") },
        createElement("span", null, "fix/benchmark-new-ade"),
      ),
    );

    expect(html).toContain('data-composer-frame-status-bar="true"');
    expect(html).toContain("turn-activity-surface");
    expect(html).toContain(sx(frameStyles.status));
    expect(html).toContain("fix/benchmark-new-ade");
    expect(html.indexOf("fix/benchmark-new-ade")).toBeLessThan(
      html.indexOf("Runtime"),
    );
  });

  test("omits the trailing group when there is nothing to put in it", () => {
    const html = renderToStaticMarkup(
      createElement(
        ComposerFrameStatusBar,
        null,
        createElement("span", null, "main"),
      ),
    );
    expect(html).toContain("main");
    expect(html).not.toContain(sx(frameStyles.trailing));
  });

  test("caps a wing reveal to the room beside the frame", () => {
    // Plenty of margin: the reveal takes its full width.
    expect(resolveComposerWingRevealWidth(400)).toBe(
      COMPOSER_WING_REVEALED_WIDTH_PX,
    );
    // Some margin: the reveal spends exactly what is there, minus breathing.
    expect(resolveComposerWingRevealWidth(60)).toBe(
      COMPOSER_WING_COLLAPSED_WIDTH_PX + 56,
    );
    // Almost none: revealing would clip the label, so the wing stays an icon
    // column instead of half-opening.
    expect(resolveComposerWingRevealWidth(16)).toBe(
      COMPOSER_WING_COLLAPSED_WIDTH_PX,
    );
    expect(resolveComposerWingRevealWidth(0)).toBe(
      COMPOSER_WING_COLLAPSED_WIDTH_PX,
    );
  });
});

describe("shelf surface", () => {
  const css = readFileSync(
    join(import.meta.dir, "..", "src", "globals.css"),
    "utf8",
  );

  test("sits between the page and the card, derived from theme tokens", () => {
    const rule = css.match(/\.turn-activity-surface\s*\{([^}]*)\}/)?.[1];

    expect(rule).toBeTruthy();
    // Both endpoints and nothing else: a literal colour here would be right in
    // one theme and wrong in the seventeen others, and either token alone
    // would collapse the shelf into the page or into the card.
    expect(rule).toContain("background-color: color-mix(");
    expect(rule).toContain("var(--card) 60%");
    expect(rule).toContain("var(--background)");
    // Colour alone cannot carry the separation in a low-contrast palette, so
    // the shelf also casts and keeps its ring.
    expect(rule).toContain("inset 0 0 0 1px color-mix(in oklch, var(--border)");
    expect(rule?.match(/oklch\(0 0 0 \//g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("frame shelves leave the surface to that one rule", () => {
    const html = renderToStaticMarkup(
      createElement(
        ComposerFrame,
        {
          bottom: createElement(
            ComposerFrameStatusBar,
            null,
            createElement("span", null, "main"),
          ),
          right: createElement(ComposerFrameWing, { side: "right" }, "Plan"),
        },
        createElement("span", null, "input"),
      ),
    );

    // `bg-card` on a shelf would silently win in a stylesheet reshuffle and
    // flatten the card back into its tray.
    expect(html).not.toContain("bg-card");
    expect(html.match(/turn-activity-surface/g)).toHaveLength(2);
  });
});
