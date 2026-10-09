import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isToolImageId,
  readPngSize,
  TOOL_IMAGE_MAX_BYTES,
  TOOL_IMAGE_MIME_TYPES,
  type ToolImageMimeType,
  type ToolImageReference,
} from "../../../src/lib/tool-images/tool-images";

/**
 * Images Stave's own tools return, kept so the conversation can show them:
 * `<root>/<workspace key>/<uuid>.<ext>`. Grouped by workspace so archiving a
 * workspace removes them with its conversation; the key is a hash, so a
 * workspace id never becomes a path segment.
 */
export function toolImageWorkspaceKey(workspaceId: string | null): string {
  return createHash("sha256")
    .update(`stave-tool-image:${workspaceId ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

export interface ToolImageStore {
  save(args: {
    workspaceId: string | null;
    mimeType: ToolImageMimeType;
    base64: string;
  }): Promise<ToolImageReference>;
  read(imageId: string): Promise<{ mimeType: ToolImageMimeType; base64: string } | null>;
  removeWorkspace(workspaceId: string): Promise<void>;
}

export function createToolImageStore(args: { rootDir: () => string }): ToolImageStore {
  const filePath = (imageId: string, mimeType: ToolImageMimeType) =>
    path.join(
      args.rootDir(),
      imageId.slice(0, 16),
      `${imageId.slice(17)}.${TOOL_IMAGE_MIME_TYPES[mimeType]}`,
    );

  return {
    async save(input) {
      const bytes = Buffer.from(input.base64, "base64");
      if (bytes.length === 0 || bytes.length > TOOL_IMAGE_MAX_BYTES) {
        throw new Error("The image is empty or too large to keep.");
      }
      const imageId = `${toolImageWorkspaceKey(input.workspaceId)}-${randomUUID()}`;
      const target = filePath(imageId, input.mimeType);
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, bytes);
      await rename(temporary, target);
      const size = input.mimeType === "image/png" ? readPngSize(input.base64) : null;
      return { imageId, mimeType: input.mimeType, ...(size ?? {}) };
    },

    async read(imageId) {
      if (!isToolImageId(imageId)) return null;
      for (const mimeType of Object.keys(TOOL_IMAGE_MIME_TYPES) as ToolImageMimeType[]) {
        try {
          const bytes = await readFile(filePath(imageId, mimeType));
          return { mimeType, base64: bytes.toString("base64") };
        } catch {
          // Try the next extension.
        }
      }
      return null;
    },

    async removeWorkspace(workspaceId) {
      await rm(path.join(args.rootDir(), toolImageWorkspaceKey(workspaceId)), {
        recursive: true,
        force: true,
      });
    },
  };
}
