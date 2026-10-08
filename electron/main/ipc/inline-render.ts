import { writeFile } from "node:fs/promises";
import { dialog, ipcMain } from "electron";
import { z } from "zod";
import {
  buildInlineRenderFileName,
  isInlineRenderId,
} from "../../../src/lib/inline-render/inline-render";
import { getInlineRenderStore } from "../inline-render/inline-render-service";
import { getMainWindow } from "../window";

const InlineRenderIdArgsSchema = z
  .object({
    renderId: z.string().min(1).max(64),
  })
  .strict();

function readRenderId(args: unknown): string | null {
  const parsed = InlineRenderIdArgsSchema.safeParse(args);
  return parsed.success && isInlineRenderId(parsed.data.renderId)
    ? parsed.data.renderId
    : null;
}

export function registerInlineRenderHandlers() {
  ipcMain.handle("inline-render:describe", async (_event, args: unknown) => {
    const renderId = readRenderId(args);
    if (!renderId) return { ok: false as const, error: "invalid arguments" };
    const record = await getInlineRenderStore().describe(renderId);
    return record
      ? { ok: true as const, exists: true as const, title: record.title, height: record.height }
      : { ok: true as const, exists: false as const };
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
