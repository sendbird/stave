import { describe, expect, test } from "bun:test";
import {
  buildAcpNativeImageBlocks,
  buildClaudeNativeImageBlocks,
  buildClaudeNativeUserContent,
  buildCodexNativeImageItems,
  collectNativeImageInputs,
  codexModelCatalogSupportsImages,
} from "../electron/providers/native-image-input";
import type { CanonicalConversationRequest } from "../src/lib/providers/provider.types";

function createConversation(
  contextParts: CanonicalConversationRequest["contextParts"],
): CanonicalConversationRequest {
  return {
    target: { providerId: "codex", model: "gpt-5.6-terra" },
    mode: "chat",
    history: [],
    input: {
      role: "user",
      providerId: "user",
      content: "Inspect the images.",
      parts: [{ type: "text", text: "Inspect the images." }],
    },
    contextParts,
  };
}

describe("native provider image input", () => {
  test("collects workspace images as absolute local paths", () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "file_context",
          filePath: "screenshots/result.png",
          content: "[Workspace image attached by path.]",
          language: "image",
        },
      ]),
    });

    expect(collection).toEqual({
      inputs: [
        {
          source: "local-file",
          path: "/tmp/project/screenshots/result.png",
          label: "screenshots/result.png",
          mimeType: "image/png",
        },
      ],
      inlineImageCount: 0,
      unresolvedInlineImageCount: 0,
    });
  });

  test("collects supported data URLs without exposing them as text", () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "image_context",
          dataUrl: "data:image/png;base64,aW1hZ2U=",
          label: "clipboard.png",
          mimeType: "image/png",
        },
      ]),
    });

    expect(collection.inlineImageCount).toBe(1);
    expect(collection.unresolvedInlineImageCount).toBe(0);
    expect(collection.inputs).toEqual([
      {
        source: "data-url",
        dataUrl: "data:image/png;base64,aW1hZ2U=",
        label: "clipboard.png",
        mimeType: "image/png",
        base64Data: "aW1hZ2U=",
      },
    ]);
  });

  test("keeps unsupported inline images eligible for text fallback", () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "image_context",
          dataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
          label: "diagram.svg",
          mimeType: "image/svg+xml",
        },
      ]),
    });

    expect(collection.inputs).toEqual([]);
    expect(collection.inlineImageCount).toBe(1);
    expect(collection.unresolvedInlineImageCount).toBe(1);
  });

  test("builds low-detail Codex image and localImage items", () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "file_context",
          filePath: "screenshots/result.webp",
          content: "[Workspace image attached by path.]",
          language: "image",
        },
        {
          type: "image_context",
          dataUrl: "data:image/jpeg;base64,aW1hZ2U=",
          label: "clipboard.jpg",
          mimeType: "image/jpeg",
        },
      ]),
    });

    expect(buildCodexNativeImageItems(collection.inputs)).toEqual([
      {
        type: "localImage",
        path: "/tmp/project/screenshots/result.webp",
        detail: "low",
      },
      {
        type: "image",
        url: "data:image/jpeg;base64,aW1hZ2U=",
        detail: "low",
      },
    ]);
  });

  test("builds Claude image blocks at the provider boundary", async () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "file_context",
          filePath: "screenshots/result.png",
          content: "[Workspace image attached by path.]",
          language: "image",
        },
        {
          type: "image_context",
          dataUrl: "data:image/webp;base64,aW1hZ2U=",
          label: "clipboard.webp",
          mimeType: "image/webp",
        },
      ]),
    });

    const result = await buildClaudeNativeImageBlocks({
      inputs: collection.inputs,
      readLocalFile: async (filePath) => {
        expect(filePath).toBe("/tmp/project/screenshots/result.png");
        return Buffer.from("local-image");
      },
    });

    expect(result).toEqual({
      blocks: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: Buffer.from("local-image").toString("base64"),
          },
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/webp",
            data: "aW1hZ2U=",
          },
        },
      ],
      failedLocalImageCount: 0,
    });
    expect(
      buildClaudeNativeUserContent({
        text: "Inspect the images.",
        blocks: result.blocks,
      }),
    ).toEqual([
      { type: "text", text: "Inspect the images." },
      ...result.blocks,
    ]);
  });

  test("builds ACP image blocks from inline and local images", async () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "file_context",
          filePath: "screenshots/result.png",
          content: "[Workspace image attached by path.]",
          language: "image",
        },
        {
          type: "image_context",
          dataUrl: "data:image/webp;base64,aW1hZ2U=",
          label: "clipboard.webp",
          mimeType: "image/webp",
        },
      ]),
    });

    const result = await buildAcpNativeImageBlocks({
      inputs: collection.inputs,
      readLocalFile: async (filePath) => {
        expect(filePath).toBe("/tmp/project/screenshots/result.png");
        return Buffer.from("local-image");
      },
    });

    expect(result).toEqual({
      blocks: [
        {
          type: "image",
          mimeType: "image/png",
          data: Buffer.from("local-image").toString("base64"),
        },
        {
          type: "image",
          mimeType: "image/webp",
          data: "aW1hZ2U=",
        },
      ],
      failedLocalImageCount: 0,
      skippedOversizedImageCount: 0,
      acceptedInputs: collection.inputs,
    });
  });

  test("skips oversized local images before reading their bytes", async () => {
    const collection = collectNativeImageInputs({
      cwd: "/tmp/project",
      conversation: createConversation([
        {
          type: "file_context",
          filePath: "screenshots/oversized.png",
          content: "[Workspace image attached by path.]",
          language: "image",
        },
      ]),
    });
    let readAttempted = false;

    const result = await buildAcpNativeImageBlocks({
      inputs: collection.inputs,
      statLocalFile: async () => ({ size: 5 * 1024 * 1024 + 1 }),
      readLocalFile: async () => {
        readAttempted = true;
        return Buffer.alloc(0);
      },
    });

    expect(readAttempted).toBe(false);
    expect(result).toEqual({
      blocks: [],
      failedLocalImageCount: 0,
      skippedOversizedImageCount: 1,
      acceptedInputs: [],
    });
  });

  test("checks the selected Codex model image modality", () => {
    expect(
      codexModelCatalogSupportsImages({
        model: "gpt-5.6-terra",
        models: [
          {
            id: "gpt-5.6-terra",
            model: "gpt-5.6-terra",
            inputModalities: ["text", "image"],
          },
        ],
      }),
    ).toBe(true);
    expect(
      codexModelCatalogSupportsImages({
        model: "text-only",
        models: [
          {
            id: "text-only",
            model: "text-only",
            inputModalities: ["text"],
          },
        ],
      }),
    ).toBe(false);
  });
});
