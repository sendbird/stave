import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerFrame,
  ComposerFrameWing,
} from "@/components/ai-elements/composer-frame";
import { ComposerWorkspaceBarView } from "@/components/session/composer-workspace-bar";

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
    expect(html).not.toContain('data-composer-frame-slot="right"');
    expect(html).toContain("prompt-input-shell");
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
  test("hides when there is no workspace or branch to show", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        workspaceLabel: "",
        folderLabel: "",
        branchLabel: "",
      }),
    );
    expect(html).toBe("");
  });

  test("does not repeat the folder when it matches the workspace name", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerWorkspaceBarView, {
        workspaceLabel: "fix-benchmark",
        folderLabel: "fix-benchmark",
        branchLabel: "fix/benchmark-new-ade",
      }),
    );

    expect(html).toContain('data-testid="composer-workspace-bar"');
    expect(html).toContain("fix-benchmark");
    expect(html).toContain("fix/benchmark-new-ade");
    expect((html.match(/title="fix-benchmark"/g) ?? []).length).toBe(1);
  });
});
