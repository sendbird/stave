import { describe, expect, test } from "bun:test";
import {
  collectClipboardFiles,
  mergeClipboardImageAttachments,
  partitionClipboardFiles,
} from "../src/components/ai-elements/prompt-input.clipboard";

function createFile(args: {
  name: string;
  type: string;
  path?: string;
}) {
  const file = new File(["content"], args.name, { type: args.type });
  if (args.path) {
    Object.defineProperty(file, "path", {
      value: args.path,
      configurable: true,
    });
  }
  return file;
}

describe("collectClipboardFiles", () => {
  test("includes files from clipboard items and files", () => {
    const textFile = createFile({ name: "notes.txt", type: "text/plain", path: "/repo/notes.txt" });
    const imageFile = createFile({ name: "capture.png", type: "image/png" });

    const files = collectClipboardFiles({
      items: [
        {
          getAsFile: () => textFile,
        },
      ],
      files: [imageFile],
    });

    expect(files).toEqual([textFile, imageFile]);
  });

  test("dedupes the same clipboard file across items and file list", () => {
    const textFile = createFile({ name: "notes.txt", type: "text/plain", path: "/repo/notes.txt" });

    const files = collectClipboardFiles({
      items: [
        {
          getAsFile: () => textFile,
        },
      ],
      files: [textFile],
    });

    expect(files).toEqual([textFile]);
  });

  // Chromium creates a new File on every clipboard read and stamps it with the read time,
  // so the two lists can describe one pasted image with lastModified values 1ms apart.
  test("matches one pasted image across lists when each read stamps a new lastModified", () => {
    const fromItems = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png", lastModified: 1_000 });
    const fromFiles = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png", lastModified: 1_001 });

    const files = collectClipboardFiles({
      items: [{ getAsFile: () => fromItems }],
      files: [fromFiles],
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toBe(fromItems);
  });

  test("keeps every same-name image of one paste when each read stamps a new lastModified", () => {
    const first = new File([new Uint8Array([1])], "image.png", { type: "image/png", lastModified: 1_000 });
    const second = new File([new Uint8Array([2])], "image.png", { type: "image/png", lastModified: 1_000 });
    const firstCopy = new File([new Uint8Array([1])], "image.png", { type: "image/png", lastModified: 1_001 });
    const secondCopy = new File([new Uint8Array([2])], "image.png", { type: "image/png", lastModified: 1_001 });

    const files = collectClipboardFiles({
      items: [{ getAsFile: () => first }, { getAsFile: () => second }],
      files: [firstCopy, secondCopy],
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toBe(first);
    expect(files[1]).toBe(second);
  });
});

describe("partitionClipboardFiles", () => {
  test("separates images from non-image files", () => {
    const imageFile = createFile({ name: "capture.png", type: "image/png" });
    const textFile = createFile({ name: "notes.txt", type: "text/plain" });

    expect(partitionClipboardFiles([imageFile, textFile])).toEqual({
      imageFiles: [imageFile],
      nonImageFiles: [textFile],
    });
  });
});

describe("mergeClipboardImageAttachments", () => {
  test("dedupes identical pasted images within the same batch", () => {
    const first = {
      kind: "image" as const,
      id: "image-1",
      label: "Pasted image",
      dataUrl: "data:image/png;base64,AAA",
    };
    const duplicate = {
      kind: "image" as const,
      id: "image-2",
      label: "Screenshot",
      dataUrl: "data:image/png;base64,AAA",
    };

    expect(mergeClipboardImageAttachments({
      incoming: [first, duplicate],
    })).toEqual([first]);
  });

  test("dedupes identical base64 payloads even when mime headers differ", () => {
    const first = {
      kind: "image" as const,
      id: "image-1",
      label: "Clipboard PNG",
      dataUrl: "data:image/png;base64,AAA",
    };
    const duplicate = {
      kind: "image" as const,
      id: "image-2",
      label: "Clipboard octet-stream",
      dataUrl: "data:application/octet-stream;base64,AAA",
    };

    expect(mergeClipboardImageAttachments({
      incoming: [first, duplicate],
    })).toEqual([first]);
  });

  test("preserves existing images and appends only new clipboard content", () => {
    const existing = {
      kind: "image" as const,
      id: "image-existing",
      label: "Existing",
      dataUrl: "data:image/png;base64,AAA",
    };
    const duplicate = {
      kind: "image" as const,
      id: "image-duplicate",
      label: "Duplicate",
      dataUrl: "data:image/png;base64,AAA",
    };
    const next = {
      kind: "image" as const,
      id: "image-next",
      label: "Next",
      dataUrl: "data:image/png;base64,BBB",
    };

    expect(mergeClipboardImageAttachments({
      existing: [existing],
      incoming: [duplicate, next],
    })).toEqual([existing, next]);
  });
});

test("keeps distinct images with identical metadata across mirrored clipboard lists", () => {
  const first = new File(["AAA"], "image.png", { type: "image/png", lastModified: 1 });
  const second = new File(["BBB"], "image.png", { type: "image/png", lastModified: 1 });
  expect(collectClipboardFiles({
    items: [first, second].map((file) => ({ getAsFile: () => file })),
    files: [first, second],
  })).toEqual([first, second]);
});
