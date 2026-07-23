import {
  extractConfluencePageReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
} from "@/lib/workspace-information";

export type ServiceLinkKind = "figma" | "jira" | "confluence";

export interface ServiceLinkBadgeInfo {
  kind: ServiceLinkKind;
  label: string;
}

const SERVICE_LINK_NAMES: Record<ServiceLinkKind, string> = {
  figma: "Figma",
  jira: "Jira",
  confluence: "Confluence",
};

export function getServiceLinkName(kind: ServiceLinkKind) {
  return SERVICE_LINK_NAMES[kind];
}

function parseHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a URL to a recognized service badge (Figma / Jira / Confluence).
 * Returns null for every other URL so callers can fall back to a plain link.
 */
export function resolveServiceLinkBadge(
  raw?: string | null,
): ServiceLinkBadgeInfo | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  const url = parseHttpUrl(value);
  if (!url) {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  const figmaReference = extractFigmaResourceReference(value);
  if (figmaReference) {
    return {
      kind: "figma",
      label: figmaReference.title || SERVICE_LINK_NAMES.figma,
    };
  }

  // Confluence must win over Jira: both live on *.atlassian.net and a
  // Confluence page title may contain an issue-key-shaped token.
  const confluenceReference = extractConfluencePageReference(value);
  if (confluenceReference) {
    return {
      kind: "confluence",
      label:
        confluenceReference.title ||
        confluenceReference.spaceKey ||
        SERVICE_LINK_NAMES.confluence,
    };
  }

  // Restrict Jira detection to Jira-looking hosts — the issue-key pattern
  // alone would false-positive on ticket-shaped tokens in arbitrary URLs.
  if (host.endsWith("atlassian.net") || host.includes("jira")) {
    const jiraReference = extractJiraIssueReference(value);
    if (jiraReference) {
      return { kind: "jira", label: jiraReference.issueKey };
    }
  }

  return null;
}
