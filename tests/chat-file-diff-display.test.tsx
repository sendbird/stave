import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenedFileDiff } from "@/components/session/chat-panel-file-blocks";

const before = Array.from({ length: 400 }, (_, index) => `line ${index}`).join("\n");
const after = before.replace("line 200", "line 200 changed");

function render() {
  return renderToStaticMarkup(
    createElement(OpenedFileDiff, {
      before,
      after,
      displayFilePath: "src/big.ts",
      filePath: "src/big.ts",
    }),
  );
}

describe("chat file diff", () => {
  test("collapses unchanged lines around a change, as Review does", () => {
    const html = render();
    expect(html).toContain(">changed</span>");
    // Only the context around the edit is drawn, not the 400-line file.
    expect(html).toContain("Expand 197 unchanged lines");
    expect(html).toContain("Expand 196 unchanged lines");
    const shownLines = new Set(
      [...html.matchAll(/data-ads-slot="line-number"[^>]*>(\d+)</g)].map((match) => Number(match[1])),
    );
    expect([...shownLines].sort((a, b) => a - b)).toEqual([198, 199, 200, 201, 202, 203, 204]);
  });
});
