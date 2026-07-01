import { describe, expect, test } from "bun:test";
import { hasPromptSubmitPayload } from "@/components/ai-elements/prompt-input-submit";

describe("hasPromptSubmitPayload", () => {
  const emptyArgs = {
    text: "",
    attachedFilePaths: [],
    imageAttachments: [],
    lensAnnotationAttachments: [],
    promptBatch: [],
  };

  test("rejects an empty draft", () => {
    expect(hasPromptSubmitPayload(emptyArgs)).toBe(false);
  });

  test("accepts staged comments without textarea text", () => {
    expect(
      hasPromptSubmitPayload({
        ...emptyArgs,
        promptBatch: [{ content: "comment to send" }],
      }),
    ).toBe(true);
  });

  test("accepts staged comment attachments without textarea text", () => {
    expect(
      hasPromptSubmitPayload({
        ...emptyArgs,
        promptBatch: [{ content: "   ", attachments: [{}] }],
      }),
    ).toBe(true);
  });

  test("accepts lens comments without textarea text", () => {
    expect(
      hasPromptSubmitPayload({
        ...emptyArgs,
        lensAnnotationAttachments: [{}],
      }),
    ).toBe(true);
  });

  test("ignores blank staged comments", () => {
    expect(
      hasPromptSubmitPayload({
        ...emptyArgs,
        promptBatch: [{ content: "   " }],
      }),
    ).toBe(false);
  });
});
