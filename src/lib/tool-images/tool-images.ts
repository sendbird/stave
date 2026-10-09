/**
 * Images in tool results, shown to the reader instead of as base64 text.
 *
 * Providers carry tool images differently: Claude drops image blocks from the
 * text it hands back, and Codex serialises the whole result, image data
 * included, into one string that is cut at 256 KiB. So a Stave tool that
 * returns an image (the Lens screenshot) also stores it and puts a small
 * reference block *first* in its result; every provider keeps that text, and
 * truncation cannot reach it. Images a third-party tool returns inline are
 * shown when the provider kept them whole.
 *
 * used by: `electron/main/tool-images/`, `electron/main/browser/browser-tools.ts`,
 * `src/components/session/message/tool-output-images.tsx`,
 * `tests/tool-images.test.ts`.
 */

export const TOOL_IMAGE_REFERENCE_KEY = "staveToolImage";
export const TOOL_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export const TOOL_IMAGE_MIME_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type ToolImageMimeType = keyof typeof TOOL_IMAGE_MIME_TYPES;

export function isToolImageMimeType(value: unknown): value is ToolImageMimeType {
  return typeof value === "string" && value in TOOL_IMAGE_MIME_TYPES;
}

const IMAGE_ID_PATTERN =
  /^[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `<workspace key>-<uuid>`: a directory and a file name, both validated. */
export function isToolImageId(value: unknown): value is string {
  return typeof value === "string" && IMAGE_ID_PATTERN.test(value);
}

export interface ToolImageReference {
  imageId: string;
  mimeType: ToolImageMimeType;
  width?: number;
  height?: number;
}

/** The text block a tool puts before its image block. */
export function buildToolImageReferenceText(reference: ToolImageReference): string {
  return JSON.stringify({ [TOOL_IMAGE_REFERENCE_KEY]: reference });
}

export type ToolOutputImage =
  | { kind: "stored"; imageId: string; mimeType: ToolImageMimeType; width?: number; height?: number }
  | { kind: "inline"; dataUrl: string; mimeType: ToolImageMimeType };

export interface ParsedToolOutput {
  images: ToolOutputImage[];
  /** What is left to show as text, with references and image data removed. */
  text: string;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_INLINE_IMAGES = 8;

function readReference(value: unknown): ToolOutputImage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isToolImageId(record.imageId) || !isToolImageMimeType(record.mimeType)) return null;
  const size = (key: string) => {
    const number = record[key];
    return typeof number === "number" && Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
  };
  return {
    kind: "stored",
    imageId: record.imageId,
    mimeType: record.mimeType,
    ...(size("width") ? { width: size("width") } : {}),
    ...(size("height") ? { height: size("height") } : {}),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function referenceInText(text: string): ToolOutputImage | null {
  const parsed = parseJson(text.trim());
  return parsed && typeof parsed === "object"
    ? readReference((parsed as Record<string, unknown>)[TOOL_IMAGE_REFERENCE_KEY])
    : null;
}

const IMAGE_BLOCK_PATTERN = /\\?"type\\?"\s*:\s*\\?"image\\?"/;

const REFERENCE_PATTERN = new RegExp(
  `\\{"${TOOL_IMAGE_REFERENCE_KEY}":\\{[^{}]*\\}\\}`,
  "g",
);

/**
 * Splits a tool's output into images and the text worth showing. Cheap for
 * ordinary output: it only parses when an image marker is present.
 */
export function parseToolOutputImages(output: string | null | undefined): ParsedToolOutput {
  const raw = output ?? "";
  const hasReference = raw.includes(TOOL_IMAGE_REFERENCE_KEY);
  const hasImageBlock = IMAGE_BLOCK_PATTERN.test(raw);
  if (!hasReference && !hasImageBlock) return { images: [], text: raw };

  const images: ToolOutputImage[] = [];
  const parsed = parseJson(raw);

  // A serialised MCP result: `{ content: [{ type: "text" | "image", ... }] }`.
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { content?: unknown }).content)) {
    const texts: string[] = [];
    for (const block of (parsed as { content: unknown[] }).content) {
      if (!block || typeof block !== "object") continue;
      const item = block as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string") {
        const reference = referenceInText(item.text);
        if (reference) images.push(reference);
        else texts.push(item.text);
      } else if (
        item.type === "image" &&
        typeof item.data === "string" &&
        isToolImageMimeType(item.mimeType) &&
        item.data.length <= (TOOL_IMAGE_MAX_BYTES * 4) / 3 &&
        BASE64_PATTERN.test(item.data)
      ) {
        if (images.length < MAX_INLINE_IMAGES) {
          images.push({ kind: "inline", mimeType: item.mimeType, dataUrl: `data:${item.mimeType};base64,${item.data}` });
        }
      }
    }
    // A stored copy and its inline original are the same picture.
    const stored = images.filter((image) => image.kind === "stored");
    return { images: stored.length > 0 ? stored : images, text: texts.join("\n").trim() };
  }

  // Plain text (Claude keeps only the text blocks), or a result cut short,
  // where the reference may still sit escaped inside a JSON string.
  const text = raw.replace(REFERENCE_PATTERN, (match) => {
    const reference = referenceInText(match);
    if (reference) images.push(reference);
    return reference ? "" : match;
  });
  if (images.length === 0 && raw.includes('\\"')) {
    for (const match of raw.replace(/\\"/g, '"').match(REFERENCE_PATTERN) ?? []) {
      const reference = referenceInText(match);
      if (reference) images.push(reference);
    }
  }
  // A truncated serialised result is half a JSON document of base64; nothing
  // in it is readable once the references are taken out.
  const truncatedImageResult = hasImageBlock && parsed === undefined;
  return { images, text: truncatedImageResult && images.length > 0 ? "" : text.trim() };
}

/** Width and height from a PNG's header, read from the start of its base64. */
export function readPngSize(base64: string): { width: number; height: number } | null {
  if (base64.length < 32) return null;
  let bytes: Uint8Array;
  try {
    const binary = atob(base64.slice(0, 32));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (!signature.every((byte, index) => bytes[index] === byte)) return null;
  const view = new DataView(bytes.buffer);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}
