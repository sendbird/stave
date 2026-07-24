import {
  DEFAULT_LENS_SESSION_ID,
  resolvePreferredBrowserSession,
  setViewVisible,
  type BrowserSessionState,
} from "./browser-manager";
import { ensureBrowserSessionWithEvents } from "./browser-session-events";
import { listKnownProjects } from "../stave-mcp-service";
import { findLensProjectKeyForWorkspace } from "../../../src/lib/lens/lens-session-selection";
import type {
  LensSessionProfileArgs,
  LensSessionScope,
} from "../../../src/lib/lens/lens.types";

export interface AcquireMcpBrowserSessionArgs {
  workspaceId: string;
  lensSessionId?: string;
  sessionScope?: LensSessionScope;
  projectKey?: string;
}

async function resolveCreationProfile(
  args: AcquireMcpBrowserSessionArgs,
): Promise<Omit<LensSessionProfileArgs, "workspaceId">> {
  const explicitProjectKey = args.projectKey?.trim();
  if (args.sessionScope === "workspace" || explicitProjectKey) {
    return {
      sessionScope: args.sessionScope,
      projectKey: explicitProjectKey,
    };
  }

  try {
    const projectKey = findLensProjectKeyForWorkspace(
      await listKnownProjects(),
      args.workspaceId,
    );
    if (projectKey) {
      return {
        sessionScope: args.sessionScope ?? "project",
        projectKey,
      };
    }
  } catch {
    // The workspace profile remains a safe fallback while the registry loads.
  }

  return { sessionScope: args.sessionScope };
}

/**
 * Resolve an MCP call to the visible/recent Lens tab, or create one hidden.
 * An explicit id only targets or creates that exact session.
 */
export async function acquireMcpBrowserSession(
  args: AcquireMcpBrowserSessionArgs,
): Promise<{ session: BrowserSessionState; created: boolean }> {
  const existing = resolvePreferredBrowserSession(
    args.workspaceId,
    args.lensSessionId,
  );
  if (existing) {
    return { session: existing, created: false };
  }

  const profile = await resolveCreationProfile(args);
  const lensSessionId = args.lensSessionId?.trim() || DEFAULT_LENS_SESSION_ID;
  const result = ensureBrowserSessionWithEvents(args.workspaceId, {
    ...profile,
    managedByMcp: true,
    lensSessionId,
  });
  if (result.created) {
    setViewVisible(args.workspaceId, false, result.session.lensSessionId);
  }
  return result;
}
