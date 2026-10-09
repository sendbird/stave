import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clampInlineRenderHeight,
  INLINE_RENDER_MAX_HTML_CHARS,
  normalizeInlineRenderTitle,
  splitInlineRenderId,
  type InlineRenderReference,
} from "../../../src/lib/inline-render/inline-render";
import {
  normalizeInlineRenderModelContext,
  type InlineRenderModelContext,
  type InlineRenderModelContextEntry,
} from "../../../src/lib/inline-render/inline-render-interaction";

/**
 * Inline render pages on disk: `<root>/<workspace key>/<uuid>.html` holds the
 * page exactly as the agent sent it, and `<uuid>.json` its title and size.
 * The bootstrap and CSP are added when the page is served, so "View source"
 * and "Save" return the agent's own markup and a policy change applies to
 * pages published before it.
 *
 * `<uuid>.context.json`, when present, holds the state the page last reported
 * for the agent (`window.stave.updateModelContext`). It is bound to the task
 * in the page's own record, never to a task the renderer names, so a page can
 * only inform the conversation it was published in.
 *
 * Grouping by workspace lets archiving a workspace remove its pages in one
 * step. The key is a hash, so workspace ids never become path segments.
 */

interface InlineRenderContextRecord {
  version: 1;
  renderId: string;
  taskId: string;
  title: string;
  context: InlineRenderModelContext;
  updatedAt: string;
}

const CONTEXT_FILE_SUFFIX = ".context.json";

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
  /** Replaces a page's model context; `null` clears it. False when the page is unknown. */
  setModelContext(renderId: string, context: InlineRenderModelContext | null): Promise<boolean>;
  readModelContext(renderId: string): Promise<InlineRenderModelContextEntry | null>;
  /** Every page context the task's pages reported, for its next turn. */
  listTaskModelContexts(args: {
    workspaceId: string | null;
    taskId: string;
  }): Promise<InlineRenderModelContextEntry[]>;
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
      contextPath: path.join(dir, `${parts.fileId}${CONTEXT_FILE_SUFFIX}`),
    };
  }

  /** A stored context, re-validated: the file is ours, but it is still read from disk. */
  async function readContextFile(
    filePath: string,
    expected: { renderId?: string; taskId?: string },
  ): Promise<InlineRenderContextRecord | null> {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<InlineRenderContextRecord>;
      if (typeof parsed.renderId !== "string" || typeof parsed.taskId !== "string") return null;
      if (expected.renderId !== undefined && parsed.renderId !== expected.renderId) return null;
      if (expected.taskId !== undefined && parsed.taskId !== expected.taskId) return null;
      const normalized = normalizeInlineRenderModelContext(parsed.context ?? {});
      if (!normalized.ok || !normalized.context) return null;
      return {
        version: 1,
        renderId: parsed.renderId,
        taskId: parsed.taskId,
        title: normalizeInlineRenderTitle(String(parsed.title ?? "")),
        context: normalized.context,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    } catch {
      return null;
    }
  }

  function toEntry(record: InlineRenderContextRecord): InlineRenderModelContextEntry {
    return {
      renderId: record.renderId,
      title: record.title,
      context: record.context,
      updatedAt: record.updatedAt,
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

    async setModelContext(renderId, context) {
      const location = locate(renderId);
      if (!location) return false;
      const record = await describe(renderId);
      if (!record) return false;
      const normalized = context === null ? null : normalizeInlineRenderModelContext(context);
      if (normalized && !normalized.ok) throw new Error(normalized.reason);
      if (!normalized?.context) {
        await rm(location.contextPath, { force: true });
        return true;
      }
      const stored: InlineRenderContextRecord = {
        version: 1,
        renderId,
        taskId: record.taskId,
        title: record.title,
        context: normalized.context,
        updatedAt: new Date().toISOString(),
      };
      await writeAtomically(location.contextPath, JSON.stringify(stored));
      return true;
    },

    async readModelContext(renderId) {
      const location = locate(renderId);
      if (!location) return null;
      const record = await readContextFile(location.contextPath, { renderId });
      return record ? toEntry(record) : null;
    },

    async listTaskModelContexts({ workspaceId, taskId }) {
      const dir = path.join(args.rootDir(), inlineRenderWorkspaceKey(workspaceId));
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const records = await Promise.all(
        names
          .filter((name) => name.endsWith(CONTEXT_FILE_SUFFIX))
          .map((name) => readContextFile(path.join(dir, name), { taskId })),
      );
      return records.flatMap((record) => (record ? [toEntry(record)] : []));
    },

    async removeWorkspace(workspaceId) {
      const dir = path.join(args.rootDir(), inlineRenderWorkspaceKey(workspaceId));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
