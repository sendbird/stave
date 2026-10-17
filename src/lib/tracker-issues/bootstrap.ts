import {
  applyTrackerIssueStaveLink,
  applyTrackerIssuesStatus,
  loadTrackerIssues,
  loadTrackerIssuesStatus,
} from "@/lib/tracker-issues/client-state";
import {
  normalizeTrackerIssuesSettings,
  type TrackerIssuesSettings,
} from "@/lib/tracker-issues/settings";
import { normalizeJiraConnectorSettings } from "@/lib/jira-connector/types";
import { useAppStore } from "@/store/app.store";

/**
 * The push channels and the initial read are process-wide, not surface-wide:
 * the top-bar badge has to be right before anybody opens the Issues surface, so
 * the wiring lives at app start rather than in the view's mount effect.
 */
let teardown: (() => void) | null = null;

function sameSettings(
  a: TrackerIssuesSettings,
  b: TrackerIssuesSettings,
): boolean {
  return (
    a.defaultView === b.defaultView &&
    a.refreshIntervalSeconds === b.refreshIntervalSeconds &&
    a.defaultKickoffStartMode === b.defaultKickoffStartMode &&
    a.sourceEnabled.crane === b.sourceEnabled.crane
  );
}

/**
 * Main keeps its own copy of the Jira connector settings and starts from the
 * defaults (off) on every launch. Settings → Integrations pushes them while it
 * is open; this sends the rehydrated copy once at startup so Jira polls after a
 * restart without the user opening Settings. Configure is idempotent, so the
 * section's later pushes only repeat it.
 */
function pushJiraConnectorConfigure() {
  const configure = window.api?.jiraConnector?.configure;
  if (!configure) {
    return;
  }
  const settings = normalizeJiraConnectorSettings(
    useAppStore.getState().settings.jiraConnector,
  );
  void Promise.resolve(configure(settings)).catch(() => undefined);
}

function pushConfigure(settings: TrackerIssuesSettings) {
  const configure = window.api?.trackerIssues?.configure;
  if (!configure) {
    return;
  }
  void Promise.resolve(configure(settings))
    .then((result) => {
      if (result?.ok && result.status) {
        applyTrackerIssuesStatus(result.status);
      }
    })
    .catch(() => undefined);
}

/**
 * Wire the renderer mirror to main. Safe to call more than once: the second
 * call returns the first call's teardown instead of double-subscribing.
 *
 * Returns a no-op cleanup in the web build, where `window.api` is absent.
 */
export function bootstrapTrackerIssuesClient(): () => void {
  if (teardown) {
    return teardown;
  }
  const api = window.api?.trackerIssues;
  if (!api) {
    return () => undefined;
  }

  const unsubscribeStatus = api.onStatus?.((status) => {
    applyTrackerIssuesStatus(status);
  });
  const unsubscribeCache = api.onCacheUpdated?.((payload) => {
    // Main only says *which* source changed, so re-read that source's page
    // rather than the whole cache.
    void loadTrackerIssues(payload.source).catch(() => undefined);
  });
  const unsubscribeKickoff = api.onKickoffUpdated?.((link) => {
    applyTrackerIssueStaveLink(link);
  });

  pushJiraConnectorConfigure();

  // Push the persisted settings before the first read: the refresh interval and
  // default view decide what main polls, so configuring after listing would
  // make the first page reflect the previous session's settings.
  let lastSettings = normalizeTrackerIssuesSettings(
    useAppStore.getState().settings.trackerIssues,
  );
  pushConfigure(lastSettings);

  const unsubscribeStore = useAppStore.subscribe((state) => {
    const next = normalizeTrackerIssuesSettings(state.settings.trackerIssues);
    if (sameSettings(next, lastSettings)) {
      return;
    }
    lastSettings = next;
    pushConfigure(next);
  });

  void loadTrackerIssuesStatus().catch(() => undefined);
  void loadTrackerIssues().catch(() => undefined);

  teardown = () => {
    teardown = null;
    unsubscribeStatus?.();
    unsubscribeCache?.();
    unsubscribeKickoff?.();
    unsubscribeStore();
  };
  return teardown;
}

/** Test-only: forget the idempotence latch without unsubscribing. */
export function resetTrackerIssuesBootstrap() {
  teardown = null;
}
