import {
  applyTrackerTaskStaveLink,
  applyTrackerTasksStatus,
  loadTrackerTasks,
  loadTrackerTasksStatus,
} from "@/lib/tracker-tasks/client-state";
import {
  normalizeTrackerTasksSettings,
  type TrackerTasksSettings,
} from "@/lib/tracker-tasks/settings";
import { useAppStore } from "@/store/app.store";

/**
 * The push channels and the initial read are process-wide, not surface-wide:
 * the top-bar badge has to be right before anybody opens the Tasks surface, so
 * the wiring lives at app start rather than in the view's mount effect.
 */
let teardown: (() => void) | null = null;

function sameSettings(
  a: TrackerTasksSettings,
  b: TrackerTasksSettings,
): boolean {
  return (
    a.defaultView === b.defaultView &&
    a.refreshIntervalSeconds === b.refreshIntervalSeconds &&
    a.defaultKickoffStartMode === b.defaultKickoffStartMode &&
    a.sourceEnabled.jira === b.sourceEnabled.jira &&
    a.sourceEnabled.crane === b.sourceEnabled.crane
  );
}

function pushConfigure(settings: TrackerTasksSettings) {
  const configure = window.api?.trackerTasks?.configure;
  if (!configure) {
    return;
  }
  void Promise.resolve(configure(settings))
    .then((result) => {
      if (result?.ok && result.status) {
        applyTrackerTasksStatus(result.status);
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
export function bootstrapTrackerTasksClient(): () => void {
  if (teardown) {
    return teardown;
  }
  const api = window.api?.trackerTasks;
  if (!api) {
    return () => undefined;
  }

  const unsubscribeStatus = api.onStatus?.((status) => {
    applyTrackerTasksStatus(status);
  });
  const unsubscribeCache = api.onCacheUpdated?.((payload) => {
    // Main only says *which* source changed, so re-read that source's page
    // rather than the whole cache.
    void loadTrackerTasks(payload.source).catch(() => undefined);
  });
  const unsubscribeKickoff = api.onKickoffUpdated?.((link) => {
    applyTrackerTaskStaveLink(link);
  });

  // Push the persisted settings before the first read: the refresh interval and
  // default view decide what main polls, so configuring after listing would
  // make the first page reflect the previous session's settings.
  let lastSettings = normalizeTrackerTasksSettings(
    useAppStore.getState().settings.trackerTasks,
  );
  pushConfigure(lastSettings);

  const unsubscribeStore = useAppStore.subscribe((state) => {
    const next = normalizeTrackerTasksSettings(state.settings.trackerTasks);
    if (sameSettings(next, lastSettings)) {
      return;
    }
    lastSettings = next;
    pushConfigure(next);
  });

  void loadTrackerTasksStatus().catch(() => undefined);
  void loadTrackerTasks().catch(() => undefined);

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
export function resetTrackerTasksBootstrap() {
  teardown = null;
}
