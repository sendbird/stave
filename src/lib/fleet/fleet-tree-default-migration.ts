// temporary-migration: fleet-tree-default
/**
 * Through 0.29.2 Fleet View opened on workspace cards (`fleetBoardLayout`
 * `cards`, the default) and saved that value with every profile, so a saved
 * `cards` cannot tell a choice from the old default. The Tree layout is now
 * the default: a profile that still reads `cards` (or nothing) moves to
 * `tree` once, and `table` is kept. The marker below records that the switch
 * ran, so a user who picks Cards afterwards keeps it. It runs on the merged
 * settings before rehydration normalizes them, and only while the marker is
 * absent, so running it again changes nothing.
 */

/** Saved with the settings once the switch ran; never read by anything else. */
export const FLEET_TREE_DEFAULT_MARKER = "fleetTreeDefaultApplied";

/** Rewrites settings in place. */
export function migrateFleetTreeDefault(settings: Record<string, unknown>): void {
  if (settings[FLEET_TREE_DEFAULT_MARKER] === true) {
    return;
  }
  if (settings.fleetBoardLayout === undefined || settings.fleetBoardLayout === "cards") {
    settings.fleetBoardLayout = "tree";
  }
  settings[FLEET_TREE_DEFAULT_MARKER] = true;
}
// end temporary-migration: fleet-tree-default
