import { writeFile } from "node:fs/promises";
import { dialog, ipcMain } from "electron";
import { z } from "zod";
import {
  buildInlineRenderFileName,
  INLINE_RENDER_NETWORK_POLICIES,
  INLINE_RENDER_THEME_VARIABLES,
  isInlineRenderId,
} from "../../../src/lib/inline-render/inline-render";
import { INLINE_RENDER_MODEL_CONTEXT_MAX_BYTES } from "../../../src/lib/inline-render/inline-render-interaction";
import { getInlineRenderStore } from "../inline-render/inline-render-service";
import { setInlineRenderPreviewContext } from "../inline-render/inline-render-preview-service";
import { getMainWindow } from "../window";

const InlineRenderIdArgsSchema = z
  .object({
    renderId: z.string().min(1).max(64),
  })
  .strict();

/** What `stave_preview_html` needs from the renderer: the user's network setting and current theme. */
const InlineRenderPreviewContextArgsSchema = z
  .object({
    networkPolicy: z.enum(INLINE_RENDER_NETWORK_POLICIES),
    theme: z
      .object({
        appearance: z.enum(["light", "dark"]),
        variables: z
          .record(z.string().max(80), z.string().max(4_000))
          .refine(
            (variables) => Object.keys(variables).length <= INLINE_RENDER_THEME_VARIABLES.length,
            "too many theme variables",
          ),
      })
      .strict()
      .nullable(),
  })
  .strict();

/**
 * A page's model context as the renderer forwards it. The size cap and JSON
 * check run again in the store (`normalizeInlineRenderModelContext`); this
 * bounds the payload before anything parses it further.
 */
const InlineRenderSetModelContextArgsSchema = z
  .object({
    renderId: z.string().min(1).max(64),
    context: z
      .object({
        text: z.string().max(INLINE_RENDER_MODEL_CONTEXT_MAX_BYTES).nullable(),
        structured: z.unknown(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const InlineRenderTaskArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(512).nullable(),
    taskId: z.string().min(1).max(512),
  })
  .strict();

function readRenderId(args: unknown): string | null {
  const parsed = InlineRenderIdArgsSchema.safeParse(args);
  return parsed.success && isInlineRenderId(parsed.data.renderId)
    ? parsed.data.renderId
    : null;
}

export function registerInlineRenderHandlers() {
  ipcMain.handle("inline-render:set-preview-context", (_event, args: unknown) => {
    const parsed = InlineRenderPreviewContextArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false as const, error: "invalid arguments" };
    setInlineRenderPreviewContext(parsed.data);
    return { ok: true as const };
  });

  ipcMain.handle("inline-render:describe", async (_event, args: unknown) => {
    const renderId = readRenderId(args);
    if (!renderId) return { ok: false as const, error: "invalid arguments" };
    const record = await getInlineRenderStore().describe(renderId);
    return record
      ? { ok: true as const, exists: true as const, title: record.title, height: record.height }
      : { ok: true as const, exists: false as const };
  });

  ipcMain.handle("inline-render:set-model-context", async (_event, args: unknown) => {
    const parsed = InlineRenderSetModelContextArgsSchema.safeParse(args);
    if (!parsed.success || !isInlineRenderId(parsed.data.renderId)) {
      return { ok: false as const, error: "invalid arguments" };
    }
    const { context } = parsed.data;
    try {
      const stored = await getInlineRenderStore().setModelContext(
        parsed.data.renderId,
        context ? { text: context.text, structured: context.structured ?? null } : null,
      );
      return stored ? { ok: true as const } : { ok: false as const, error: "not found" };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  });

  ipcMain.handle("inline-render:read-model-context", async (_event, args: unknown) => {
    const renderId = readRenderId(args);
    if (!renderId) return { ok: false as const, error: "invalid arguments" };
    return { ok: true as const, entry: await getInlineRenderStore().readModelContext(renderId) };
  });

  ipcMain.handle("inline-render:list-task-model-contexts", async (_event, args: unknown) => {
    const parsed = InlineRenderTaskArgsSchema.safeParse(args);
    if (!parsed.success) return { ok: false as const, error: "invalid arguments" };
    return {
      ok: true as const,
      entries: await getInlineRenderStore().listTaskModelContexts(parsed.data),
    };
  });

  ipcMain.handle("inline-render:read-source", async (_event, args: unknown) => {
    const renderId = readRenderId(args);
    if (!renderId) return { ok: false as const, error: "invalid arguments" };
    const page = await getInlineRenderStore().read(renderId);
    return page
      ? { ok: true as const, html: page.html, title: page.record.title }
      : { ok: false as const, error: "not found" };
  });

  ipcMain.handle("inline-render:save-as", async (_event, args: unknown) => {
    const renderId = readRenderId(args);
    if (!renderId) return { ok: false as const, error: "invalid arguments" };
    const page = await getInlineRenderStore().read(renderId);
    if (!page) return { ok: false as const, error: "not found" };
    const options = {
      defaultPath: buildInlineRenderFileName(page.record.title),
      filters: [{ name: "HTML", extensions: ["html"] }], // i18n-ignore: file format name
    };
    const window = getMainWindow();
    const choice = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (choice.canceled || !choice.filePath) {
      return { ok: false as const, canceled: true as const };
    }
    try {
      await writeFile(choice.filePath, page.html, "utf8");
      return { ok: true as const, filePath: choice.filePath };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  });
}
