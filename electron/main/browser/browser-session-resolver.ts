import {
  DEFAULT_LENS_SESSION_ID,
  resolvePreferredBrowserSession,
  type BrowserSessionState,
} from "./browser-manager";
import { ensureBrowserSessionGuest } from "./browser-guest-broker";
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

  /*
   * Main cannot create the page. A Lens guest is a `<webview>` element, which
   * only the renderer can mount, so an agent-opened session is a request to the
   * Stave window rather than a local construction.
   *
   * The renderer parks it hidden. That is not a compromise for the agent path —
   * a parked guest keeps compositing, so screenshots and layout reads answer
   * normally — and it is what lets `stave_lens_*` work without taking over the
   * user's foreground.
   */
  const result = await ensureBrowserSessionGuest(args.workspaceId, {
    ...profile,
    lensSessionId: args.lensSessionId?.trim() || DEFAULT_LENS_SESSION_ID,
  });
  if (result.created) {
    result.session.managedByMcp = true;
  }
  return result;
}
