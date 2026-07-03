import { describe, expect, test } from "bun:test";
import { resolveUserMessageClipboardPlainText } from "@/lib/user-message-copy";

describe("resolveUserMessageClipboardPlainText", () => {
  test("restores bullet markers when a rendered user prompt list is copied", () => {
    const sourceMarkdown = [
      "Please do these:",
      "",
      "- Update the README",
      "- Run the tests",
    ].join("\n");

    expect(
      resolveUserMessageClipboardPlainText({
        sourceMarkdown,
        selectedText: "Please do these:\n\nUpdate the README\nRun the tests",
      }),
    ).toBe(sourceMarkdown);
  });

  test("restores numbered markers when a rendered user prompt list is copied", () => {
    const sourceMarkdown = [
      "Steps:",
      "",
      "1. Inspect the branch",
      "2. Patch the UI",
    ].join("\n");

    expect(
      resolveUserMessageClipboardPlainText({
        sourceMarkdown,
        selectedText: "Steps:\n\nInspect the branch\nPatch the UI",
      }),
    ).toBe(sourceMarkdown);
  });

  test("restores task list markers when a rendered user prompt list is copied", () => {
    const sourceMarkdown = [
      "- [ ] Keep the checkbox",
      "- [x] Preserve completed state",
    ].join("\n");

    expect(
      resolveUserMessageClipboardPlainText({
        sourceMarkdown,
        selectedText: "Keep the checkbox\nPreserve completed state",
      }),
    ).toBe(sourceMarkdown);
  });

  test("leaves non-list messages on the default clipboard path", () => {
    expect(
      resolveUserMessageClipboardPlainText({
        sourceMarkdown: "Plain message",
        selectedText: "Plain message",
      }),
    ).toBeNull();
  });
});
