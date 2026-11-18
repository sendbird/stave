import { app } from "electron";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { secondaryRunCoordinator } from "./runs/secondary-run-coordinator-instance";
import { ensurePersistenceReady } from "./state";
import { generateTarsSuggestions } from "./tars-suggestions";
import type { TarsSuggestInput, TarsSuggestResult } from "../../src/lib/tars/suggestion-generation";

/**
 * Suggested requests from main's own persistence connection: the reasoning
 * model the conversation saved, in Tars's own directory (the same one its
 * message turns use), with no tools. Changes no work.
 */
export async function suggestTarsRequests(input: TarsSuggestInput): Promise<TarsSuggestResult> {
  const store = await ensurePersistenceReady();
  const cwd = path.join(app.getPath("userData"), "representative");
  mkdirSync(cwd, { recursive: true });
  return generateTarsSuggestions(input, { settings: () => store.tarsConversations.getSettings(), coordinator: secondaryRunCoordinator, cwd });
}
