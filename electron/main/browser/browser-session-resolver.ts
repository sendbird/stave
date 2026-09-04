import {
  DEFAULT_LENS_SESSION_ID,
  markBrowserSessionAgentTouched,
  markBrowserSessionManagedByMcp,
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
  /**
   * Whether a session rebuilt after its page died should return to that page.
   *
   * Left on by default so an agent that reaches for a session whose guest went
   * down with the renderer finds it where it left it. Callers that navigate
   * immediately afterwards pass `false`: their own load would abort the restore
   * and the abort would be logged to the page's console as a failure.
   */
  restorePreviousUrl?: boolean;
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
  /*
   * A dead guest is not a session to hand back.
   *
   * Nothing tells main that a guest page is gone — a renderer reload or crash
   * destroys every `<webview>` at once and leaves main's registry entries
   * pointing at destroyed WebContents. Returning one means the agent gets a
   * corpse: every tool call after this throws "Object has been destroyed" and
   * the session is never rebuilt, because the rebuild only happens on the path
   * below. `ensureBrowserSessionGuest` applies the same rule one layer down;
   * this is the same rule at the layer that can skip it.
   */
  if (existing && !existing.webContents.isDestroyed()) {
    markBrowserSessionAgentTouched(existing);
    return { session: existing, created: false };
  }

  const profile = await resolveCreationProfile(args);

  /*
   * Main cannot create the page. A Lens guest is a `<webview>` element, which
   * only the renderer can mount, so an agent-opened session is a request to the
   * Stave window rather than a local construction.
   *
   * The renderer parks it invisible, which is what lets `stave_lens_*` work
   * without taking over the user's foreground. "Invisible" is load-bearing and
   * narrower than it sounds: parking is `opacity: 0`, because Chromium produces
   * no compositor frame for a `visibility: hidden` or offscreen guest and
   * `Page.captureScreenshot` then fails outright — measured, see
   * `resolveLensGuestStyle`. Parked this way the guest keeps compositing, so
   * screenshots and layout reads answer normally.
   */
  const result = await ensureBrowserSessionGuest(args.workspaceId, {
    ...profile,
    lensSessionId:
      args.lensSessionId?.trim() ||
      // Only ever set when the preferred session's guest is dead: rebuild that
      // session rather than opening a second one beside its corpse. The page it
      // was on is recorded under this id too, so rebuilding it is also what
      // makes the restore land.
      existing?.lensSessionId ||
      DEFAULT_LENS_SESSION_ID,
    restorePreviousUrl: args.restorePreviousUrl,
  });
  if (result.created) {
    markBrowserSessionManagedByMcp(result.session);
  } else {
    markBrowserSessionAgentTouched(result.session);
  }
  return result;
}
