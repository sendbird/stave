import {
  createEmptyWorkspaceInformation,
  createWorkspaceAmplifyLink,
  createWorkspaceConfluencePage,
  createWorkspaceCraneIssue,
  createWorkspaceFigmaResource,
  createWorkspaceJiraIssue,
  createWorkspaceLinkedPullRequest,
  createWorkspaceSlackThread,
  createWorkspaceStorybookResource,
  createWorkspaceTodoItem,
  extractConfluencePageReference,
  extractCraneIssueReference,
  extractFigmaResourceReference,
  extractGitHubPullRequestReference,
  extractJiraIssueReference,
  extractSlackThreadReference,
  type WorkspaceMartinProjectLink,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import { formatWorkspaceInfoTaskSeedPrompt } from "@/lib/workspace-information-task-seed";
import { extractJsonObject } from "@/lib/workspace-turn-summary";
import { sanitizeBranchName } from "@/store/project.utils";

const MAX_SOURCE_CONTEXT_CHARS = 12_000;
const MAX_PROJECT_PROMPT_CHARS = 8_000;

export const KICKOFF_PANEL_TARGETS = [
  "jiraIssues",
  "confluencePages",
  "figmaResources",
  "slackThreads",
  "linkedPullRequests",
  "storybookResources",
  "amplifyLinks",
] as const;

export type KickoffPanelTarget = (typeof KICKOFF_PANEL_TARGETS)[number];

export interface KickoffSourceConfig {
  id: string;
  label: string;
  enabled: boolean;
  builtIn: boolean;
  match: {
    hostSuffixes: string[];
    pathPattern: string;
    keyPattern: string;
  };
  mcpServers: string[];
  resolutionHint: string;
  panelTarget: KickoffPanelTarget;
}

export interface KickoffPanelEntry {
  target: KickoffPanelTarget;
  title: string;
  url: string;
  reference: string;
  note: string;
}

export interface KickoffProposalDraft {
  branchName: string;
  workspaceLabel: string;
  sourceSummary: string;
  firstTaskTitle: string;
  firstTaskPrompt: string;
  panelEntries: KickoffPanelEntry[];
  notes: string;
  todos: string[];
  degraded: boolean;
  sourceConfigId: string | null;
  model: string;
  martinProject?: WorkspaceMartinProjectLink | null;
}

export interface KickoffSourceClassification {
  kind: "configured" | "freeform";
  input: string;
  config: KickoffSourceConfig | null;
  extractedReference: Record<string, string | number | null> | null;
}

export const DEFAULT_KICKOFF_SOURCE_CONFIGS: KickoffSourceConfig[] = [
  {
    id: "confluence",
    label: "Confluence",
    enabled: true,
    builtIn: true,
    match: {
      hostSuffixes: ["atlassian.net"],
      pathPattern: "^/wiki/",
      keyPattern: "",
    },
    mcpServers: [],
    resolutionHint: "Read the page as the product or implementation spec.",
    panelTarget: "confluencePages",
  },
  {
    id: "jira",
    label: "Jira",
    enabled: true,
    builtIn: true,
    match: {
      hostSuffixes: ["atlassian.net"],
      pathPattern: "(?:/browse/|/issues/)[A-Z][A-Z0-9]+-\\d+",
      keyPattern: "\\b[A-Z][A-Z0-9]+-\\d+\\b",
    },
    mcpServers: [],
    resolutionHint: "Read the issue, acceptance criteria, and linked context.",
    panelTarget: "jiraIssues",
  },
  {
    id: "slack",
    label: "Slack",
    enabled: true,
    builtIn: true,
    match: {
      hostSuffixes: ["slack.com"],
      pathPattern: "^/archives/",
      keyPattern: "",
    },
    mcpServers: [],
    resolutionHint:
      "Read the thread and distinguish decisions from open questions.",
    panelTarget: "slackThreads",
  },
  {
    id: "figma",
    label: "Figma",
    enabled: true,
    builtIn: true,
    match: {
      hostSuffixes: ["figma.com"],
      pathPattern: "^/(?:file|design|proto|board|slides)/",
      keyPattern: "",
    },
    mcpServers: [],
    resolutionHint:
      "Inspect the linked design and preserve its interaction intent.",
    panelTarget: "figmaResources",
  },
  {
    id: "github",
    label: "GitHub",
    enabled: true,
    builtIn: true,
    match: {
      hostSuffixes: ["github.com"],
      pathPattern: "^/[^/]+/[^/]+/(?:pull|issues)/\\d+",
      keyPattern: "",
    },
    mcpServers: [],
    resolutionHint: "Read the issue or pull request and its linked discussion.",
    panelTarget: "linkedPullRequests",
  },
];

const PANEL_TARGET_SET = new Set<string>(KICKOFF_PANEL_TARGETS);

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(value.map(normalizeString).filter((entry) => entry.length > 0)),
  );
}

function compilePattern(value: string, flags = "") {
  if (!value.trim()) {
    return null;
  }
  try {
    return new RegExp(value, flags);
  } catch {
    return null;
  }
}

function isKickoffPanelTarget(value: unknown): value is KickoffPanelTarget {
  return typeof value === "string" && PANEL_TARGET_SET.has(value);
}

function isMatchingHost(hostname: string, suffix: string) {
  const normalizedSuffix = suffix.trim().toLowerCase().replace(/^\./, "");
  return (
    normalizedSuffix.length > 0 &&
    (hostname === normalizedSuffix || hostname.endsWith(`.${normalizedSuffix}`))
  );
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function cloneKickoffSourceConfig(config: KickoffSourceConfig) {
  return {
    ...config,
    match: { ...config.match, hostSuffixes: [...config.match.hostSuffixes] },
    mcpServers: [...config.mcpServers],
  };
}

export function normalizeKickoffSourceConfigs(
  value: unknown,
): KickoffSourceConfig[] {
  if (!Array.isArray(value)) {
    return DEFAULT_KICKOFF_SOURCE_CONFIGS.map(cloneKickoffSourceConfig);
  }

  const configs: KickoffSourceConfig[] = [];
  const seenIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const id = normalizeString(candidate.id);
    const label = normalizeString(candidate.label) || id;
    const match =
      candidate.match && typeof candidate.match === "object"
        ? (candidate.match as Record<string, unknown>)
        : {};
    if (
      !id ||
      seenIds.has(id) ||
      !isKickoffPanelTarget(candidate.panelTarget)
    ) {
      continue;
    }
    seenIds.add(id);
    configs.push({
      id,
      label,
      enabled: candidate.enabled !== false,
      builtIn: candidate.builtIn === true,
      match: {
        hostSuffixes: normalizeStringList(match.hostSuffixes).map((host) =>
          host.toLowerCase().replace(/^\./, ""),
        ),
        pathPattern: normalizeString(match.pathPattern),
        keyPattern: normalizeString(match.keyPattern),
      },
      mcpServers: normalizeStringList(candidate.mcpServers),
      resolutionHint: normalizeString(candidate.resolutionHint),
      panelTarget: candidate.panelTarget,
    });
  }
  return configs;
}

function extractBuiltInReference(
  configId: string,
  input: string,
): Record<string, string | number | null> | null {
  const toRecord = <T extends object>(value: T | null) =>
    value ? ({ ...value } as Record<string, string | number | null>) : null;
  switch (configId) {
    case "jira":
      return toRecord(extractJiraIssueReference(input));
    case "confluence":
      return toRecord(extractConfluencePageReference(input));
    case "figma":
      return toRecord(extractFigmaResourceReference(input));
    case "slack":
      return toRecord(extractSlackThreadReference(input));
    case "github": {
      const pullRequest = extractGitHubPullRequestReference(input);
      if (pullRequest) {
        return toRecord({ ...pullRequest, kind: "pull request" });
      }
      const url = parseHttpUrl(input);
      const segments = url?.pathname.split("/").filter(Boolean) ?? [];
      const number = Number.parseInt(segments[3] ?? "", 10);
      return segments[0] &&
        segments[1] &&
        segments[2] === "issues" &&
        Number.isInteger(number) &&
        number > 0
        ? toRecord({
            owner: segments[0],
            repo: segments[1],
            number,
            kind: "issue",
          })
        : null;
    }
    default:
      return null;
  }
}

export function classifyKickoffSource(args: {
  input: string;
  configs: KickoffSourceConfig[];
}): KickoffSourceClassification {
  const input = args.input.trim();
  const url = parseHttpUrl(input);

  for (const config of args.configs) {
    if (!config.enabled) {
      continue;
    }
    if (url) {
      const hostMatches =
        config.match.hostSuffixes.length === 0 ||
        config.match.hostSuffixes.some((suffix) =>
          isMatchingHost(url.hostname.toLowerCase(), suffix),
        );
      // URL paths tolerate host/path casing differences.
      const pathPattern = compilePattern(config.match.pathPattern, "i");
      const pathMatches =
        config.match.pathPattern.length === 0 ||
        Boolean(pathPattern?.test(`${url.pathname}${url.search}`));
      if (hostMatches && pathMatches) {
        return {
          kind: "configured",
          input,
          config,
          extractedReference: extractBuiltInReference(config.id, input),
        };
      }
    } else {
      // Key patterns stay case-sensitive so casual text such as "chart-2024"
      // is not misclassified as an issue key (for example Jira's
      // `[A-Z][A-Z0-9]+-\d+`).
      const keyPattern = compilePattern(config.match.keyPattern);
      if (keyPattern?.test(input)) {
        return {
          kind: "configured",
          input,
          config,
          extractedReference: extractBuiltInReference(config.id, input),
        };
      }
    }
  }

  return { kind: "freeform", input, config: null, extractedReference: null };
}

function truncate(value: string, maxChars: number) {
  const normalized = value.trim();
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function buildKickoffResolutionPrompt(args: {
  instructionPrompt: string;
  classification: KickoffSourceClassification;
  branchNamingRule?: string | null;
  projectBasePrompt?: string | null;
}) {
  const config = args.classification.config;
  return [
    args.instructionPrompt.trim(),
    "",
    "Source:",
    truncate(args.classification.input, MAX_SOURCE_CONTEXT_CHARS),
    "",
    `Source type: ${config?.label ?? "Free-form prompt"}`,
    `Preferred panel target: ${config?.panelTarget ?? "none"}`,
    args.classification.extractedReference
      ? `Extracted reference: ${JSON.stringify(args.classification.extractedReference)}`
      : "Extracted reference: none",
    config?.resolutionHint ? `Resolution hint: ${config.resolutionHint}` : "",
    "",
    "Branch naming rule:",
    args.branchNamingRule?.trim() ||
      "Use a short Conventional Commits-style prefix such as feat/, fix/, refactor/, docs/, test/, or chore/ followed by a lowercase kebab-case description.",
    args.projectBasePrompt?.trim()
      ? [
          "",
          "Project instructions:",
          truncate(args.projectBasePrompt, MAX_PROJECT_PROMPT_CHARS),
        ].join("\n")
      : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function coercePanelEntries(value: unknown): KickoffPanelEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const candidate = entry as Record<string, unknown>;
    if (!isKickoffPanelTarget(candidate.target)) {
      return [];
    }
    return [
      {
        target: candidate.target,
        title: normalizeString(candidate.title),
        url: normalizeString(candidate.url),
        reference: normalizeString(candidate.reference),
        note: normalizeString(candidate.note),
      },
    ];
  });
}

export function parseKickoffProposalResponse(args: {
  value: string;
  classification: KickoffSourceClassification;
  model: string;
}): KickoffProposalDraft | null {
  const jsonObject = extractJsonObject(args.value);
  if (!jsonObject) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonObject) as Record<string, unknown>;
    const branchName = sanitizeBranchName({
      value: normalizeString(parsed.branchName),
    });
    if (!branchName) {
      return null;
    }
    const sourceSummary =
      normalizeString(parsed.sourceSummary) ||
      args.classification.config?.label ||
      "Workspace kickoff";
    const firstTaskTitle =
      normalizeString(parsed.firstTaskTitle) || sourceSummary;
    return {
      branchName,
      workspaceLabel:
        normalizeString(parsed.workspaceLabel) || firstTaskTitle || branchName,
      sourceSummary,
      firstTaskTitle,
      firstTaskPrompt:
        normalizeString(parsed.firstTaskPrompt) || args.classification.input,
      panelEntries: coercePanelEntries(parsed.panelEntries),
      notes: normalizeString(parsed.notes),
      todos: normalizeStringList(parsed.todos),
      degraded: false,
      sourceConfigId: args.classification.config?.id ?? null,
      model: args.model,
    };
  } catch {
    return null;
  }
}

function slugify(value: string) {
  const slug = sanitizeBranchName({
    value: value
      .toLowerCase()
      .replaceAll(/https?:\/\/\S+/g, " ")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, ""),
  });
  return slug.slice(0, 48) || "workspace-kickoff";
}

function buildDeterministicPanelEntry(
  classification: KickoffSourceClassification,
): KickoffPanelEntry | null {
  const config = classification.config;
  if (!config || !parseHttpUrl(classification.input)) {
    return null;
  }
  const reference = classification.extractedReference;
  let title = config.label;
  let referenceLabel = "";
  switch (config.panelTarget) {
    case "jiraIssues":
      referenceLabel = normalizeString(reference?.issueKey);
      title = referenceLabel || title;
      break;
    case "confluencePages":
      referenceLabel = normalizeString(reference?.spaceKey);
      title = normalizeString(reference?.title) || referenceLabel || title;
      break;
    case "figmaResources":
      referenceLabel = normalizeString(reference?.nodeId);
      title =
        normalizeString(reference?.title) ||
        normalizeString(reference?.fileKey) ||
        title;
      break;
    case "slackThreads":
      referenceLabel = normalizeString(reference?.channelId);
      title = referenceLabel || title;
      break;
    case "linkedPullRequests": {
      const owner = normalizeString(reference?.owner);
      const repo = normalizeString(reference?.repo);
      const number =
        typeof reference?.number === "number" ? reference.number : null;
      const kind = normalizeString(reference?.kind);
      title =
        owner && repo && number
          ? `${owner}/${repo} ${kind === "issue" ? "issue" : "PR"} #${number}`
          : title;
      break;
    }
    case "storybookResources":
    case "amplifyLinks":
      title = normalizeString(reference?.title) || title;
      break;
  }
  return {
    target: config.panelTarget,
    title,
    url: classification.input,
    reference: referenceLabel,
    note: "",
  };
}

export function buildDeterministicKickoffProposal(args: {
  classification: KickoffSourceClassification;
  model?: string;
}): KickoffProposalDraft {
  const config = args.classification.config;
  const reference = args.classification.extractedReference;
  const referenceLabel =
    normalizeString(reference?.issueKey) ||
    normalizeString(reference?.title) ||
    (typeof reference?.number === "number" ? `PR ${reference.number}` : "");
  const sourceSummary =
    referenceLabel ||
    config?.label ||
    args.classification.input.split(/\s+/).slice(0, 8).join(" ") ||
    "Workspace kickoff";
  const panelEntry = buildDeterministicPanelEntry(args.classification);
  const branchSeed = referenceLabel || sourceSummary;
  const branchName = `feat/${slugify(branchSeed)}`;
  const firstTaskTitle = `Kick off ${sourceSummary}`.slice(0, 80);
  const firstTaskPrompt = panelEntry
    ? formatWorkspaceInfoTaskSeedPrompt({
        title: firstTaskTitle,
        sourceLabel: config?.label ?? "workspace source",
        url: panelEntry.url,
        referenceLabel: panelEntry.reference,
      })
    : args.classification.input;

  return {
    branchName,
    workspaceLabel: sourceSummary.slice(0, 80),
    sourceSummary,
    firstTaskTitle,
    firstTaskPrompt,
    panelEntries: panelEntry ? [panelEntry] : [],
    notes: "",
    todos: [],
    degraded: true,
    sourceConfigId: config?.id ?? null,
    model: args.model ?? "deterministic",
  };
}

export function buildWorkspaceInformationSeed(
  draft: KickoffProposalDraft,
): WorkspaceInformationState {
  const information = createEmptyWorkspaceInformation();
  information.martinProject = draft.martinProject ?? null;
  information.notes = draft.notes.trim();
  information.todos = draft.todos.map((text) => ({
    ...createWorkspaceTodoItem(),
    text,
  }));

  for (const entry of draft.panelEntries) {
    switch (entry.target) {
      case "jiraIssues": {
        // A Crane task URL carries a Jira-shaped key, so a kickoff proposal can
        // land one here. Keep it out of the Jira section.
        const craneReference = extractCraneIssueReference(entry.url);
        if (craneReference) {
          information.craneIssues = [
            ...(information.craneIssues ?? []),
            {
              ...createWorkspaceCraneIssue(),
              issueKey: craneReference.issueKey || entry.reference,
              title: entry.title,
              url: entry.url,
              note: entry.note,
            },
          ];
          break;
        }
        information.jiraIssues.push({
          ...createWorkspaceJiraIssue(),
          issueKey: entry.reference,
          title: entry.title,
          url: entry.url,
          note: entry.note,
        });
        break;
      }
      case "confluencePages":
        information.confluencePages.push({
          ...createWorkspaceConfluencePage(),
          title: entry.title,
          url: entry.url,
          spaceKey: entry.reference,
          note: entry.note,
        });
        break;
      case "figmaResources":
        information.figmaResources.push({
          ...createWorkspaceFigmaResource(),
          title: entry.title,
          url: entry.url,
          nodeId: entry.reference,
          note: entry.note,
        });
        break;
      case "slackThreads":
        information.slackThreads.push({
          ...createWorkspaceSlackThread(),
          url: entry.url,
          channelName: entry.reference || entry.title,
          note: entry.note,
        });
        break;
      case "linkedPullRequests":
        information.linkedPullRequests.push({
          ...createWorkspaceLinkedPullRequest(),
          title: entry.title,
          url: entry.url,
          note: entry.note,
        });
        break;
      case "storybookResources":
        information.storybookResources.push({
          ...createWorkspaceStorybookResource(),
          title: entry.title,
          url: entry.url,
          note: entry.note,
        });
        break;
      case "amplifyLinks":
        information.amplifyLinks.push({
          ...createWorkspaceAmplifyLink(),
          label: entry.title,
          url: entry.url,
          note: entry.note,
        });
        break;
    }
  }

  return information;
}
