import type { WorkspaceInformationState } from "../workspace-information";
import {
  STAVE_SYNC_LIMITS,
  StaveSyncLinkV1Schema,
  type StaveSyncLinkV1,
} from "./contract";

/**
 * Maps workspace resources onto the merge contract. The result is capped at
 * `STAVE_SYNC_LIMITS.linksPerMerge` so a link-heavy workspace can never build a
 * payload the runtime is contractually obliged to reject.
 */
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

  const links: StaveSyncLinkV1[] = [];
  for (const candidate of candidates) {
    if (links.length >= STAVE_SYNC_LIMITS.linksPerMerge) break;
    const parsed = StaveSyncLinkV1Schema.safeParse(candidate);
    if (parsed.success) links.push(parsed.data);
  }
  return links;
}
