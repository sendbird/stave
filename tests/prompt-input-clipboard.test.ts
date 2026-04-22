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
