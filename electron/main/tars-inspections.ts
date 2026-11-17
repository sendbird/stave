import type { TarsInspectAction } from "../../src/lib/tars/conversation";
import type { TarsResponsibility, TarsSnapshot } from "../../src/lib/tars/types";

/** Two reads allow a follow-up on discovered evidence, without an unbounded paid loop. */
export const TARS_INSPECTION_ROUNDS = 2;
export const TARS_INSPECTION_VIEW_CHARS = 12_000;
/** Includes JSON escaping and metadata, across every round of the same message. */
export const TARS_INSPECTION_TOTAL_CHARS = 24_000;
export interface TarsInspectionObservation extends TarsInspectAction {
  observedAt: string;
  status: "read" | "notOwned" | "unavailable" | "sizeLimit";
  content: string;
  truncated: boolean;
}
export type TarsInspectionReader = (row: TarsResponsibility, view: TarsInspectAction["view"]) => Promise<unknown>;

/** Do not let an unknown id reach any host reader, including ids omitted from this profile's snapshot. */
export async function inspectTarsResponsibility(action: TarsInspectAction, snapshot: TarsSnapshot,
  read: TarsInspectionReader | undefined, observedAt: string, remaining: number): Promise<TarsInspectionObservation | null> {
  const observation: TarsInspectionObservation = { ...action, observedAt, status: "read", content: "", truncated: false };
  const size = () => JSON.stringify(observation).length;
  if (size() > remaining) return null;
  const row = snapshot.responsibilities.find((candidate) => candidate.id === action.responsibilityId);
  if (!row) observation.status = "notOwned";
  else if (!read) observation.status = "unavailable";
  // Do not do I/O when even a small result cannot fit; empty never means a successful read.
  else if (remaining - size() < 100) observation.status = "sizeLimit";
  else {
    try {
      const value = await read(row, action.view);
      const text = typeof value === "string" ? value : JSON.stringify(value);
      if (text === undefined) observation.status = "unavailable";
      else {
        observation.content = text.slice(0, TARS_INSPECTION_VIEW_CHARS);
        observation.truncated = observation.content.length < text.length;
      }
    } catch {
      // Never feed raw host exceptions (which can contain paths or credentials) to the model.
      observation.status = "unavailable";
    }
  }
  while (size() > remaining && observation.content.length) {
    observation.content = observation.content.slice(0, Math.max(0, observation.content.length - Math.max(1, Math.ceil((size() - remaining) / 2))));
    observation.truncated = true;
  }
  if (/[\uD800-\uDBFF]$/.test(observation.content)) { observation.content = observation.content.slice(0, -1); observation.truncated = true; }
  return size() <= remaining ? observation : null;
}
