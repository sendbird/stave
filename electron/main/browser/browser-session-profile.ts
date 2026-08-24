import { createHash } from "node:crypto";
import type {
  LensSessionProfileArgs,
  LensSessionScope,
} from "../../../src/lib/lens/lens.types";

/**
 * Every Lens partition starts with this. The `will-attach-webview` clamp keys
 * on it, so the two cannot drift: a new profile shape that does not use this
 * prefix is refused attachment rather than silently granted default
 * preferences.
 */
export const LENS_PARTITION_PREFIX = "persist:lens-";

export interface ResolvedLensSessionProfile {
  scope: LensSessionScope;
  partition: string;
  keyHash: string;
}

export function normalizeLensSessionScope(value: unknown): LensSessionScope {
  return value === "workspace" ? "workspace" : "project";
}

function hashProfileKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function resolveLensSessionProfile(
  args: LensSessionProfileArgs,
): ResolvedLensSessionProfile {
  const scope = normalizeLensSessionScope(args.sessionScope);
  const projectKey = args.projectKey?.trim();

  if (scope === "project" && projectKey) {
    const keyHash = hashProfileKey(projectKey);
    return {
      scope: "project",
      partition: `${LENS_PARTITION_PREFIX}project-${keyHash}`,
      keyHash,
    };
  }

  const keyHash = hashProfileKey(args.workspaceId);
  return {
    scope: "workspace",
    partition: `${LENS_PARTITION_PREFIX}${args.workspaceId}`,
    keyHash,
  };
}

/**
 * Whether a partition name belongs to Lens. Used by the webview attach clamp,
 * which must refuse to hand Lens guest preferences to a tag pointed anywhere
 * else.
 */
export function isLensGuestPartition(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(LENS_PARTITION_PREFIX) &&
    value.length > LENS_PARTITION_PREFIX.length
  );
}
