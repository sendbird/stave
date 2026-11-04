import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorSaveConflictBanner } from "@/components/panes/surfaces/editor-save-conflict";
import type { EditorTab } from "@/types/chat";

const conflictedTab: EditorTab = {
  id: "file:note.txt",
  filePath: "note.txt",
  language: "plaintext",
  content: "local change\n",
  savedContent: "alpha\n",
  baseRevision: "node:6:1",
  conflictRevision: "node:13:2",
  hasConflict: true,
  isDirty: true,
};

function render(comparing: boolean) {
  return renderToStaticMarkup(
    createElement(EditorSaveConflictBanner, {
      tab: conflictedTab,
      comparing,
      onCompareChange: () => {},
    }),
  );
}

describe("EditorSaveConflictBanner", () => {
  test("offers Compare, Keep mine and Reload from disk as a warning", () => {
    const html = render(false);
    expect(html).toContain('data-testid="editor-save-conflict"');
    expect(html).toContain("This file changed on disk");
    expect(html).toContain("Saving is paused until you choose");
    expect(html).toContain(">Compare<");
    expect(html).toContain(">Keep mine<");
    expect(html).toContain(">Reload from disk<");
    expect(html).toContain('aria-pressed="false"');
  });

  test("turns Compare into a toggle while the comparison is open", () => {
    const html = render(true);
    expect(html).toContain(">Hide comparison<");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Comparing the file on disk with your unsaved edits");
  });
});
