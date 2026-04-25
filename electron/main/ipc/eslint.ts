import { ipcMain } from "electron";
import { lintFile, fixFile } from "../eslint/eslint-service";
import { EslintRequestArgsSchema } from "./schemas";

export function registerEslintHandlers() {
  ipcMain.handle("eslint:lint", async (_event, args: unknown) => {
    const parsed = EslintRequestArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid ESLint lint request." };
    }
    return lintFile(parsed.data);
  });

  ipcMain.handle("eslint:fix", async (_event, args: unknown) => {
    const parsed = EslintRequestArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, detail: "Invalid ESLint fix request." };
    }
    return fixFile(parsed.data);
  });
}
