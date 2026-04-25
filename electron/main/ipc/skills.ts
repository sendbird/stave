import { ipcMain } from "electron";
import { SkillCatalogArgsSchema } from "./schemas";
import { discoverSkillCatalog } from "../utils/skills";

export function registerSkillsHandlers() {
  ipcMain.handle("skills:get-catalog", async (_event, args: unknown) => {
    const parsedArgs = SkillCatalogArgsSchema.safeParse(args);
    if (!parsedArgs.success) {
      return {
        ok: false,
        catalog: {
          workspacePath: null,
          fetchedAt: new Date().toISOString(),
          roots: [],
          skills: [],
          detail: "Invalid skill catalog request.",
        },
        message: "Invalid skill catalog request.",
      };
    }

    return discoverSkillCatalog({
      workspacePath: parsedArgs.data.workspacePath,
      sharedSkillsHome: parsedArgs.data.sharedSkillsHome,
    });
  });
}
