import { ipcMain } from "electron";
import { z } from "zod";
import { isToolImageId } from "../../../src/lib/tool-images/tool-images";
import { getToolImageStore } from "../tool-images/tool-image-service";

const ToolImageArgsSchema = z.object({ imageId: z.string().min(1).max(64) }).strict();

export function registerToolImageHandlers() {
  ipcMain.handle("tool-images:read", async (_event, args: unknown) => {
    const parsed = ToolImageArgsSchema.safeParse(args);
    if (!parsed.success || !isToolImageId(parsed.data.imageId)) {
      return { ok: false as const, error: "invalid arguments" };
    }
    const image = await getToolImageStore().read(parsed.data.imageId);
    return image
      ? { ok: true as const, dataUrl: `data:${image.mimeType};base64,${image.base64}` }
      : { ok: false as const, error: "not found" };
  });
}
