/**
 * Keeps the images a Claude tool result returns, so the reply can show them.
 *
 * Claude event mapping keeps only the text blocks of a tool result. A Stave
 * tool that returns an image (the Lens screenshot) already stores it and puts a
 * reference block first; a third-party tool (a browser extension screenshot)
 * does not. This step stores those images and adds the same reference block in
 * front of each, before mapping drops the image data.
 *
 * used by: `electron/providers/claude-sdk-runtime.ts`,
 * `tests/claude-tool-result-images.test.ts`.
 */
import {
  TOOL_IMAGE_MAX_BYTES,
  TOOL_IMAGE_REFERENCE_KEY,
  buildToolImageReferenceText,
  isToolImageMimeType,
  type ToolImageMimeType,
  type ToolImageReference,
} from "../../src/lib/tool-images/tool-images";

export type SaveToolResultImage = (input: {
  mimeType: ToolImageMimeType;
  base64: string;
}) => Promise<ToolImageReference>;

/** At most this many images are kept from one tool result. */
const MAX_IMAGES_PER_RESULT = 8;

interface ImageBlock {
  type: "image";
  source: { type: "base64"; media_type: ToolImageMimeType; data: string };
}

function readImageBlock(value: unknown): ImageBlock | null {
  if (!value || typeof value !== "object") return null;
  const block = value as { type?: unknown; source?: unknown };
  if (block.type !== "image" || !block.source || typeof block.source !== "object") return null;
  const source = block.source as { type?: unknown; media_type?: unknown; data?: unknown };
  if (
    source.type !== "base64" ||
    !isToolImageMimeType(source.media_type) ||
    typeof source.data !== "string" ||
    source.data.length === 0 ||
    source.data.length > (TOOL_IMAGE_MAX_BYTES * 4) / 3
  ) {
    return null;
  }
  return block as ImageBlock;
}

function hasReferenceText(content: readonly unknown[]): boolean {
  return content.some((value) => {
    if (!value || typeof value !== "object") return false;
    const block = value as { type?: unknown; text?: unknown };
    return block.type === "text" && typeof block.text === "string" && block.text.includes(TOOL_IMAGE_REFERENCE_KEY);
  });
}

async function withStoredImages(
  content: readonly unknown[],
  save: SaveToolResultImage,
): Promise<unknown[] | null> {
  if (hasReferenceText(content)) return null;
  let stored = 0;
  let changed = false;
  const next: unknown[] = [];
  for (const value of content) {
    const image = stored < MAX_IMAGES_PER_RESULT ? readImageBlock(value) : null;
    if (image) {
      const reference = await save({ mimeType: image.source.media_type, base64: image.source.data }).catch(() => null);
      if (reference) {
        next.push({ type: "text", text: buildToolImageReferenceText(reference) });
        stored += 1;
        changed = true;
      }
    }
    next.push(value);
  }
  return changed ? next : null;
}

/**
 * Returns the message with a stored-image reference in front of each image
 * block in its tool results, or the same message when there is nothing to keep.
 */
export async function storeClaudeToolResultImages<T>(message: T, save: SaveToolResultImage): Promise<T> {
  const record = message as { type?: unknown; message?: { content?: unknown } };
  if (record?.type !== "user") return message;
  const content = record.message?.content;
  if (!Array.isArray(content)) return message;
  let changed = false;
  const nextContent: unknown[] = [];
  for (const value of content) {
    const block = value as { type?: unknown; content?: unknown } | null;
    if (block && typeof block === "object" && block.type === "tool_result" && Array.isArray(block.content)) {
      const nextResult = await withStoredImages(block.content, save);
      if (nextResult) {
        nextContent.push({ ...block, content: nextResult });
        changed = true;
        continue;
      }
    }
    nextContent.push(value);
  }
  if (!changed) return message;
  return { ...record, message: { ...record.message, content: nextContent } } as T;
}
