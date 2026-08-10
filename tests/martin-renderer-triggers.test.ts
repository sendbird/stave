import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  maybeRefreshMartinContext,
  notifyMartinInformationEdited,
  notifyMartinPrOpened,
  shouldPushMartinEvent,
  type MartinTriggerWorkspaceContext,
} from "../src/lib/martin-sync/renderer-triggers";
import { DEFAULT_MARTIN_SYNC_SETTINGS } from "../src/lib/martin-sync/types";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";

const originalWindow = (globalThis as { window?: unknown }).window;
const enqueueCalls: unknown[] = [];
const linksCalls: unknown[] = [];
const refreshCalls: unknown[] = [];

const context: MartinTriggerWorkspaceContext = {
  workspaceId: "workspace-1",
  workspaceName: "Sync workspace",
  branch: "feat/sync",
  martinProject: {
    ref: "checkout-v2",
    slug: "checkout-v2",
    name: "Checkout v2",
    url: "https://atelier.example.com/apps/martin/p/checkout-v2",
    linkedAt: "2026-08-09T12:00:00.000Z",
    lastPulledAt: "2026-08-09T12:00:00.000Z",
  },
};

beforeEach(() => {
  enqueueCalls.length = 0;
  linksCalls.length = 0;
  refreshCalls.length = 0;
  (globalThis as { window?: unknown }).window = {
    api: {
      martinSync: {
        enqueue: async (args: unknown) => {
          enqueueCalls.push(args);
          return { ok: true };
        },
        notifyLinksChanged: async (args: unknown) => {
          linksCalls.push(args);
          return { ok: true };
        },
        refreshContext: async (args: unknown) => {
          refreshCalls.push(args);
          return { ok: true };
        },
      },
    },
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("Martin renderer triggers", () => {
  test("applies the master and per-event toggles", () => {
    expect(
      shouldPushMartinEvent({
        settings: DEFAULT_MARTIN_SYNC_SETTINGS,
        kind: "pr_opened",
      }),
    ).toBe(false);

    const enabled = {
      ...DEFAULT_MARTIN_SYNC_SETTINGS,
      enabled: true,
    };
    expect(
      shouldPushMartinEvent({ settings: enabled, kind: "pr_opened" }),
    ).toBe(true);
    expect(
      shouldPushMartinEvent({
        settings: enabled,
        kind: "task_completed",
      }),
    ).toBe(true);
    expect(
      shouldPushMartinEvent({ settings: enabled, kind: "work_update" }),
    ).toBe(false);
    expect(
      shouldPushMartinEvent({
        settings: { ...enabled, prOpened: false, taskCompleted: false },
        kind: "workspace_linked",
      }),
    ).toBe(true);
  });

  test("pushes a PR event only for an active project mapping", () => {
    const settings = {
      ...DEFAULT_MARTIN_SYNC_SETTINGS,
      enabled: true,
    };
    notifyMartinPrOpened({
      context,
      settings,
      prUrl: "https://github.com/acme/repo/pull/12",
      prTitle: "feat(sync): add project mirroring",
    });
    expect(enqueueCalls).toEqual([
      {
        workspaceId: "workspace-1",
        projectRef: "checkout-v2",
        kind: "pr_opened",
        summary: "feat(sync): add project mirroring",
        sourceUrl: "https://github.com/acme/repo/pull/12",
        workspaceName: "Sync workspace",
        branch: "feat/sync",
      },
    ]);

    notifyMartinPrOpened({
      context: { ...context, martinProject: null },
      settings,
      prUrl: "https://github.com/acme/repo/pull/13",
      prTitle: "No mapping",
    });
    notifyMartinPrOpened({
      context: {
        ...context,
        martinProject: { ...context.martinProject!, stale: true },
      },
      settings,
      prUrl: "https://github.com/acme/repo/pull/14",
      prTitle: "Stale mapping",
    });
    expect(enqueueCalls).toHaveLength(1);
  });

  test("mirrors resource links only when their mapped payload changes", () => {
    const settings = {
      ...DEFAULT_MARTIN_SYNC_SETTINGS,
      enabled: true,
    };
    const previous = createEmptyWorkspaceInformation();
    notifyMartinInformationEdited({
      context,
      settings,
      previous,
      next: { ...previous },
    });
    expect(linksCalls).toHaveLength(0);

    const next = {
      ...previous,
      linkedPullRequests: [
        {
          id: "pr-1",
          title: "Add sync",
          url: "https://github.com/acme/repo/pull/12",
          status: "open",
          note: "",
        },
      ],
    };
    notifyMartinInformationEdited({ context, settings, previous, next });
    expect(linksCalls).toEqual([
      {
        workspaceId: "workspace-1",
        projectRef: "checkout-v2",
        links: [
          {
            kind: "github",
            label: "Add sync",
            url: "https://github.com/acme/repo/pull/12",
            note: "",
          },
        ],
      },
    ]);
  });

  test("refreshes linked context only after its age threshold", () => {
    maybeRefreshMartinContext({
      workspaceId: "workspace-1",
      martinProject: {
        ...context.martinProject!,
        lastPulledAt: new Date().toISOString(),
      },
    });
    maybeRefreshMartinContext({
      workspaceId: "workspace-1",
      martinProject: {
        ...context.martinProject!,
        lastPulledAt: "2000-01-01T00:00:00.000Z",
      },
    });
    expect(refreshCalls).toEqual([{ workspaceId: "workspace-1" }]);
  });
});
