import { ipcMain } from "electron";
import { z } from "zod";
import {
  requestInlineCompletion,
  abortActiveInlineCompletion,
  isInlineCompletionAvailable,
} from "../../providers/inline-completion";

const InlineCompletionArgsSchema = z.object({
  prefix: z.string().max(50_000),
  suffix: z.string().max(50_000),
  filePath: z.string().max(4096),
  language: z.string().max(200),
  maxTokens: z.number().int().min(1).max(1024).optional(),
  systemPromptOverride: z.string().max(10_000).optional(),
});

export function registerInlineCompletionHandlers() {
  ipcMain.handle("inline-completion:request", async (_event, args: unknown) => {
    const parsed = InlineCompletionArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, text: "", error: "Invalid inline completion request." };
    }
    return requestInlineCompletion(parsed.data);
  });

  ipcMain.handle("inline-completion:abort", () => {
    abortActiveInlineCompletion();
    return { ok: true };
  });

  ipcMain.handle("inline-completion:available", () => {
    return { ok: true, available: isInlineCompletionAvailable() };
  });
}
