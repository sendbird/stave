import type { LensViewportWidth } from "../../../src/lib/lens/lens-viewport";

const MAX_REMEMBERED_WIDTHS = 64;
const widths = new Map<string, Exclude<LensViewportWidth, "fit">>();

function key(workspaceId: string, lensSessionId: string): string {
  return `${workspaceId}\u0000${lensSessionId}`;
}

export function getLensViewportWidth(
  workspaceId: string,
  lensSessionId: string,
): LensViewportWidth {
  return widths.get(key(workspaceId, lensSessionId)) ?? "fit";
}

/** Remember only fixed widths, across guest rebuilds and within this app run. */
export function rememberLensViewportWidth(
  workspaceId: string,
  lensSessionId: string,
  width: LensViewportWidth,
): void {
  const id = key(workspaceId, lensSessionId);
  widths.delete(id);
  if (width === "fit") return;
  widths.set(id, width);
  if (widths.size > MAX_REMEMBERED_WIDTHS) {
    const oldest = widths.keys().next();
    if (!oldest.done) widths.delete(oldest.value);
  }
}
