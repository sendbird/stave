import type { Macro } from "@/lib/macros/types";

const ASSIGN_ENTRY_ID = "agents:assign";

/**
 * `!assign` in the composer: the rest of the draft becomes the work source and
 * Kickoff opens so the user chooses who does the work. The agent makes its own
 * task, so this works on a new task as well as on one with history.
 */
export const ASSIGN_PALETTE_ENTRY: Macro = {
  id: ASSIGN_ENTRY_ID,
  label: "Assign to an agent…",
  slug: "assign",
  description: "Open Kickoff with this request and choose the agent to assign it to",
  body: "",
  insertMode: "replace",
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function isAssignPaletteEntry(entry: Pick<Macro, "id">): boolean {
  return entry.id === ASSIGN_ENTRY_ID;
}
