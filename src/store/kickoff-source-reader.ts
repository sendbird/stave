import { i18n } from "@/i18n/runtime";
import {
  buildKickoffSourceEvidence,
  type KickoffSourceEvidence,
} from "@/lib/kickoff-brief";
import type { KickoffSourceClassification } from "@/lib/workspace-kickoff";

/** Uses the existing main-owned Jira connector; credentials never cross IPC. */
export async function readKickoffSource(
  classification: KickoffSourceClassification,
): Promise<KickoffSourceEvidence> {
  const evidence = buildKickoffSourceEvidence(classification.input);
  const key = classification.extractedReference?.issueKey;
  if (classification.config?.id !== "jira" || typeof key !== "string")
    return evidence;
  const api = window.api;
  if (!api?.jiraConnector?.getStatus || !api.trackerIssues?.getDetail)
    return evidence;
  try {
    const result = await api.jiraConnector.getStatus();
    if (!result.ok || !result.status.configured || !result.status.siteUrl)
      return evidence;
    // An issue key is only unique within a Jira site. Never silently resolve a
    // pasted URL against a different signed-in site's issue with the same key.
    const suppliedUrl = classification.input.match(
      /https?:\/\/[^\s<>"']+/,
    )?.[0];
    const url = suppliedUrl ? new URL(suppliedUrl) : null;
    if (url && url.origin !== new URL(result.status.siteUrl).origin) {
      return {
        ...evidence,
        detail:
          i18n.t("kickoff:kickoffSourceReader.thisJiraLinkBelongsToADifferent"),
      };
    }
    const response = await api.trackerIssues.getDetail({
      source: "jira",
      taskRef: key,
    });
    if (!response.ok || !response.detail) {
      return {
        ...evidence,
        detail:
          i18n.t("kickoff:kickoffSourceReader.jiraContentCouldNotBeReadPaste"),
      };
    }
    const detail = response.detail;
    if (
      detail.key !== key ||
      new URL(detail.url).origin !== new URL(result.status.siteUrl).origin
    )
      return evidence;
    const fetchedText = `${detail.key}: ${detail.title}\n\n${detail.description}`;
    return {
      ...evidence,
      status: "fetched",
      fetchedText,
      url: detail.url,
      fetchedAt: new Date().toISOString(),
      truncated: evidence.truncated || fetchedText.length > 12_000,
      detail:
        i18n.t("kickoff:kickoffSourceReader.readJiraTitleAndDescriptionThroughThe"),
    };
  } catch {
    return {
      ...evidence,
      detail:
        i18n.t("kickoff:kickoffSourceReader.jiraContentCouldNotBeReadPaste"),
    };
  }
}
