import { createHash } from "node:crypto";
import type {
  LensSessionProfileArgs,
  LensSessionScope,
} from "../../../src/lib/lens/lens.types";

export interface ResolvedLensSessionProfile {
  scope: LensSessionScope;
  partition: string;
  keyHash: string;
}

export function normalizeLensSessionScope(
  value: unknown,
): LensSessionScope {
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
      partition: `persist:lens-project-${keyHash}`,
      keyHash,
    };
  }

  const keyHash = hashProfileKey(args.workspaceId);
  return {
    scope: "workspace",
    partition: `persist:lens-${args.workspaceId}`,
    keyHash,
  };
}
