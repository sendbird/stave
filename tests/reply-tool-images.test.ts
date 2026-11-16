import { describe, expect, test } from "bun:test";
import { storeClaudeToolResultImages } from "../electron/providers/claude-tool-result-images";
import {
  CLAUDE_STAVE_LENS_INSTRUCTIONS,
  CLAUDE_STAVE_NATIVE_BROWSER_INSTRUCTIONS,
} from "../electron/providers/claude-browser-instructions";
import { CODEX_STAVE_LENS_INSTRUCTIONS } from "../electron/providers/codex-runtime-config";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-event-mapping";
import {
  REPLY_SCREENSHOT_INSTRUCTION,
  buildToolImageReferenceText,
  collectReplyToolImages,
  firstReplyImageNumberByToolUseId,
} from "../src/lib/tool-images/tool-images";
import en from "../src/locales/en/session.json";
import ko from "../src/locales/ko/session.json";

const IMAGE_A = "0123456789abcdef-11111111-2222-3333-4444-555555555555";
const IMAGE_B = "0123456789abcdef-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const IMAGE_C = "0123456789abcdef-99999999-8888-7777-6666-555555555555";

function reference(imageId: string) {
  return buildToolImageReferenceText({ imageId, mimeType: "image/png" });
}

describe("collectReplyToolImages", () => {
  test("numbers the assistant's own images in call order across tool calls", () => {
    const images = collectReplyToolImages([
      { type: "text" },
      { type: "tool_use", toolUseId: "t1", state: "output-available", output: reference(IMAGE_A) },
      { type: "tool_use", toolUseId: "t2", state: "output-available", output: "plain text" },
      { type: "tool_use", toolUseId: "sub", ownerAgentId: "agent-1", state: "output-available", output: reference(IMAGE_C) },
      { type: "tool_use", toolUseId: "t3", state: "output-error", output: reference(IMAGE_C) },
      { type: "tool_use", toolUseId: "t4", state: "output-available", output: `note\n${reference(IMAGE_B)}` },
    ]);
    expect(images.map((entry) => [entry.number, entry.toolUseId])).toEqual([
      [1, "t1"],
      [2, "t4"],
    ]);
    expect(images.map((entry) => (entry.image.kind === "stored" ? entry.image.imageId : null))).toEqual([
      IMAGE_A,
      IMAGE_B,
    ]);
    expect([...firstReplyImageNumberByToolUseId(images)]).toEqual([
      ["t1", 1],
      ["t4", 2],
    ]);
  });

  test("returns nothing for a reply without tool images", () => {
    expect(collectReplyToolImages([{ type: "text" }, { type: "tool_use", state: "output-available", output: "ok" }])).toEqual([]);
  });
});

describe("storeClaudeToolResultImages", () => {
  const imageBlock = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/AAAA" } };

  test("stores a third-party tool image and puts its reference first, so mapping keeps it", async () => {
    const saved: string[] = [];
    const message = {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "chrome-1", content: [{ type: "text", text: "Took a screenshot" }, imageBlock] }],
      },
    };
    const next = await storeClaudeToolResultImages(message, async (image) => {
      saved.push(image.mimeType);
      return { imageId: IMAGE_A, mimeType: image.mimeType };
    });
    expect(saved).toEqual(["image/jpeg"]);
    expect(next).not.toBe(message);
    const events = mapClaudeMessageToEvents({ message: next as never, claudeDebugStream: false });
    const result = events.find((event) => event.type === "tool_result");
    expect(result && "output" in result ? result.output : "").toContain(IMAGE_A);
    expect(collectReplyToolImages([{ type: "tool_use", state: "output-available", output: result && "output" in result ? result.output : "" }])).toHaveLength(1);
  });

  test("leaves a Lens result that already carries a stored reference alone", async () => {
    const message = {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "lens-1", content: [{ type: "text", text: reference(IMAGE_B) }, { ...imageBlock, source: { ...imageBlock.source, media_type: "image/png" } }] }] },
    };
    let calls = 0;
    const next = await storeClaudeToolResultImages(message, async () => {
      calls += 1;
      return { imageId: IMAGE_A, mimeType: "image/png" };
    });
    expect(calls).toBe(0);
    expect(next).toBe(message);
  });

  test("keeps the message when storing fails or there is no image", async () => {
    const failing = {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "x", content: [imageBlock] }] },
    };
    expect(await storeClaudeToolResultImages(failing, async () => { throw new Error("disk full"); })).toBe(failing);
    const assistant = { type: "assistant", message: { content: [] } };
    expect(await storeClaudeToolResultImages(assistant, async () => ({ imageId: IMAGE_A, mimeType: "image/png" }))).toBe(assistant);
  });
});

describe("reply screenshot naming", () => {
  test("every screenshot-capable instruction block tells the model how to name screenshots", () => {
    for (const block of [CLAUDE_STAVE_NATIVE_BROWSER_INSTRUCTIONS, CLAUDE_STAVE_LENS_INSTRUCTIONS, CODEX_STAVE_LENS_INSTRUCTIONS]) {
      expect(block).toContain(REPLY_SCREENSHOT_INSTRUCTION);
    }
  });

  test("the names the model is told to use match the thumbnail labels", () => {
    const koLabel = ko.toolOutputImages.label.replace("{{index}}", "1");
    const enLabel = en.toolOutputImages.label.replace("{{index}}", "1");
    expect(koLabel).toBe("사진 1");
    expect(REPLY_SCREENSHOT_INSTRUCTION).toContain(`"${koLabel}"`);
    expect(REPLY_SCREENSHOT_INSTRUCTION).toContain(`"${enLabel}"`);
  });
});
