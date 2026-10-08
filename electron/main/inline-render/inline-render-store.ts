import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clampInlineRenderHeight,
  INLINE_RENDER_MAX_HTML_CHARS,
  normalizeInlineRenderTitle,
  splitInlineRenderId,
  type InlineRenderReference,
} from "../../../src/lib/inline-render/inline-render";

/**
 * Inline render pages on disk: `<root>/<workspace key>/<uuid>.html` holds the
 * page exactly as the agent sent it, and `<uuid>.json` its title and size.
 * The bootstrap and CSP are added when the page is served, so "View source"
 * and "Save" return the agent's own markup and a policy change applies to
 * pages published before it.
 *
 * Grouping by workspace lets archiving a workspace remove its pages in one
 * step. The key is a hash, so workspace ids never become path segments.
 */

export interface InlineRenderRecord {
  version: 1;
  renderId: string;
  title: string;
  height: number;
  taskId: string;
  turnId: string | null;
  createdAt: string;
}

export function inlineRenderWorkspaceKey(workspaceId: string | null): string {
  return createHash("sha256")
    .update(`stave-inline-render:${workspaceId ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

export interface InlineRenderStore {
  publish(args: {
    workspaceId: string | null;
    taskId: string;
    turnId: string | null;
    html: string;
    title: string;
    height?: number;
  }): Promise<InlineRenderReference>;
  read(renderId: string): Promise<{ html: string; record: InlineRenderRecord } | null>;
  describe(renderId: string): Promise<InlineRenderRecord | null>;
  removeWorkspace(workspaceId: string): Promise<void>;
}

export function createInlineRenderStore(args: { rootDir: () => string }): InlineRenderStore {
  function locate(renderId: string) {
    const parts = splitInlineRenderId(renderId);
    if (!parts) return null;
    const dir = path.join(args.rootDir(), parts.workspaceKey);
    return {
      dir,
      htmlPath: path.join(dir, `${parts.fileId}.html`),
      recordPath: path.join(dir, `${parts.fileId}.json`),
    };
  }

  async function writeAtomically(filePath: string, content: string) {
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, "utf8");
    try {
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async function describe(renderId: string): Promise<InlineRenderRecord | null> {
    const location = locate(renderId);
    if (!location) return null;
    try {
      const parsed = JSON.parse(await readFile(location.recordPath, "utf8")) as Partial<InlineRenderRecord>;
      if (parsed.renderId !== renderId || typeof parsed.taskId !== "string") return null;
      return {
        version: 1,
        renderId,
        title: normalizeInlineRenderTitle(String(parsed.title ?? "")),
        height: clampInlineRenderHeight(parsed.height),
        taskId: parsed.taskId,
        turnId: typeof parsed.turnId === "string" ? parsed.turnId : null,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
      };
    } catch {
      return null;
    }
  }

  return {
    async publish(input) {
      if (input.html.length === 0 || input.html.length > INLINE_RENDER_MAX_HTML_CHARS) {
        throw new Error(
          `The page must be between 1 and ${INLINE_RENDER_MAX_HTML_CHARS} characters.`,
        );
      }
      const renderId = `${inlineRenderWorkspaceKey(input.workspaceId)}-${randomUUID()}`;
      const location = locate(renderId);
      if (!location) throw new Error("Could not allocate an inline render id.");
      const record: InlineRenderRecord = {
        version: 1,
        renderId,
        title: normalizeInlineRenderTitle(input.title),
        height: clampInlineRenderHeight(input.height),
        taskId: input.taskId,
        turnId: input.turnId,
        createdAt: new Date().toISOString(),
      };
      await mkdir(location.dir, { recursive: true });
      // The page first: a record without its page would describe a render
      // that cannot load, while a page without a record is simply unreachable.
      await writeAtomically(location.htmlPath, input.html);
      try {
        await writeAtomically(location.recordPath, JSON.stringify(record));
      } catch (error) {
        await rm(location.htmlPath, { force: true });
        throw error;
      }
      return { renderId, title: record.title, height: record.height };
    },

    async read(renderId) {
      const location = locate(renderId);
      if (!location) return null;
      const record = await describe(renderId);
      if (!record) return null;
      try {
        return { html: await readFile(location.htmlPath, "utf8"), record };
      } catch {
        return null;
      }
    },

    describe,

    async removeWorkspace(workspaceId) {
      const dir = path.join(args.rootDir(), inlineRenderWorkspaceKey(workspaceId));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
