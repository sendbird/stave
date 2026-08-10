import type { WorkspaceInformationState } from "../workspace-information";
import { StaveSyncLinkV1Schema, type StaveSyncLinkV1 } from "./contract";

export function buildMartinSyncLinks(
  info: WorkspaceInformationState,
): StaveSyncLinkV1[] {
  const candidates: unknown[] = [
    ...info.linkedPullRequests.map((item) => ({
      kind: "github",
      label: item.title || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.figmaResources.map((item) => ({
      kind: "figma",
      label: item.title || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.slackThreads.map((item) => ({
      kind: "slack",
      label: item.channelName || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.jiraIssues.map((item) => ({
      kind: "other",
      label: item.title
        ? `${item.issueKey}: ${item.title}`
        : item.issueKey || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.confluencePages.map((item) => ({
      kind: "other",
      label: item.title || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.storybookResources.map((item) => ({
      kind: "other",
      label: item.title || item.url,
      url: item.url,
      note: item.note,
    })),
    ...info.amplifyLinks.map((item) => ({
      kind: "other",
      label: item.label || item.url,
      url: item.url,
      note: item.note,
    })),
  ];

  return candidates.flatMap((candidate) => {
    const parsed = StaveSyncLinkV1Schema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}
