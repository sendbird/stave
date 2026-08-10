import { describe, expect, test } from "bun:test";

import {
  MartinContextBundleV1Schema,
  MartinProjectListResponseV1Schema,
  STAVE_SYNC_CONTRACT_VERSION,
  StaveSyncEventsRequestV1Schema,
  StaveSyncEventsResponseV1Schema,
  StaveSyncLinksMergeRequestV1Schema,
} from "../src/lib/martin-sync/contract";
import { buildMartinSyncLinks } from "../src/lib/martin-sync/links";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";
import {
  AtelierConnectorPairArgsSchema,
  MartinSyncEnqueueArgsSchema,
} from "../electron/main/ipc/schemas";

const fixtureDirectory = new URL("./fixtures/stave-sync-v1/", import.meta.url);

async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

describe("stave-sync-v1 contract", () => {
  test("exposes the pinned contract version", () => {
    expect(STAVE_SYNC_CONTRACT_VERSION).toBe("stave-sync-v1");
  });

  test("validates pairing and enqueue IPC arguments", () => {
    expect(
      AtelierConnectorPairArgsSchema.safeParse({
        baseUrl: "https://atelier.example.com",
        code: "stp_abc",
        name: "My Stave",
        requestedScopes: ["crane", "martin"],
      }).success,
    ).toBe(true);
    expect(
      MartinSyncEnqueueArgsSchema.safeParse({
        workspaceId: "worktree:abc",
        projectRef: "checkout-v2",
        kind: "pr_opened",
        summary: "PR #12: Add sync",
        sourceUrl: "https://github.com/acme/repo/pull/12",
        workspaceName: "feat/sync",
        branch: "feat/sync",
      }).success,
    ).toBe(true);
    expect(
      MartinSyncEnqueueArgsSchema.safeParse({ kind: "nope" }).success,
    ).toBe(false);
  });

  test("accepts the shared valid fixtures", async () => {
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("valid-events-request.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncEventsResponseV1Schema.safeParse(
        await readFixture("valid-events-response.json"),
      ).success,
    ).toBe(true);
    expect(
      StaveSyncLinksMergeRequestV1Schema.safeParse(
        await readFixture("valid-links-merge-request.json"),
      ).success,
    ).toBe(true);
    expect(
      MartinProjectListResponseV1Schema.safeParse(
        await readFixture("valid-project-list.json"),
      ).success,
    ).toBe(true);
    expect(
      MartinContextBundleV1Schema.safeParse(
        await readFixture("valid-context-bundle.json"),
      ).success,
    ).toBe(true);
  });

  test("rejects invalid fixtures", async () => {
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("invalid-event-kind.json"),
      ).success,
    ).toBe(false);
    expect(
      StaveSyncEventsRequestV1Schema.safeParse(
        await readFixture("invalid-event-forbidden-property.json"),
      ).success,
    ).toBe(false);
    expect(
      StaveSyncLinksMergeRequestV1Schema.safeParse(
        await readFixture("invalid-links-non-https.json"),
      ).success,
    ).toBe(false);
  });

  test("rejects event batches above 20 entries", async () => {
    const payload = await readFixture("valid-events-request.json");
    const oversized = Array.from({ length: 21 }, (_, index) => ({
      ...payload.events[0],
      staveEventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    expect(
      StaveSyncEventsRequestV1Schema.safeParse({
        ...payload,
        events: oversized,
      }).success,
    ).toBe(false);
  });

  test("maps workspace information resources to martin links", () => {
    const info = createEmptyWorkspaceInformation();
    info.linkedPullRequests.push({
      id: "pr-1",
      title: "Add sync",
      url: "https://github.com/acme/repo/pull/12",
      status: "open",
      note: "",
    });
    info.figmaResources.push({
      id: "figma-1",
      title: "Sync flows",
      url: "https://www.figma.com/design/abc",
      nodeId: "",
      note: "",
    });
    info.jiraIssues.push({
      id: "jira-1",
      issueKey: "ACME-7",
      title: "Sync epic",
      url: "https://acme.atlassian.net/browse/ACME-7",
      status: "",
      note: "",
    });
    info.slackThreads.push({
      id: "slack-1",
      url: "https://acme.slack.com/archives/C1/p1",
      channelName: "#eng",
      note: "",
    });
    expect(buildMartinSyncLinks(info)).toEqual([
      {
        kind: "github",
        url: "https://github.com/acme/repo/pull/12",
        label: "Add sync",
        note: "",
      },
      {
        kind: "figma",
        url: "https://www.figma.com/design/abc",
        label: "Sync flows",
        note: "",
      },
      {
        kind: "slack",
        url: "https://acme.slack.com/archives/C1/p1",
        label: "#eng",
        note: "",
      },
      {
        kind: "other",
        url: "https://acme.atlassian.net/browse/ACME-7",
        label: "ACME-7: Sync epic",
        note: "",
      },
    ]);
  });

  test("skips resources without an https url", () => {
    const info = createEmptyWorkspaceInformation();
    info.jiraIssues.push({
      id: "jira-2",
      issueKey: "ACME-8",
      title: "Draft",
      url: "",
      status: "",
      note: "",
    });
    expect(buildMartinSyncLinks(info)).toEqual([]);
  });
});
