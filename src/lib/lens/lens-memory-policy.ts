import type { LensResourceEvent } from "./lens-resource-history";

/** Device capacity is a budget input, not a claim about OS memory pressure. */
export function lensMemoryBudgetKB(totalKB: number): number {
  if (!Number.isFinite(totalKB) || totalKB <= 0) return 512 * 1024;
  return Math.round(Math.min(512 * 1024, Math.max(128 * 1024, totalKB / 32)));
}

/** Repeated reloads earn a bounded cooldown across every automatic eviction path. */
export function lensReopenCooldownUntil(events: readonly LensResourceEvent[], workspaceId: string, lensSessionId: string, now: number): number {
  const reopenings = events.filter((event) => event.workspaceId === workspaceId && event.lensSessionId === lensSessionId && event.kind === "reopened" && now - event.at < 30 * 60_000);
  const latest = reopenings.at(-1);
  return latest ? latest.at + Math.min(15, 2 ** Math.min(reopenings.length, 4)) * 60_000 : 0;
}
