import { z } from "zod";

import {
  TrackerTaskDetailSchema,
  TrackerTaskSchema,
  type TrackerPriorityLevel,
  type TrackerStatusCategory,
  type TrackerTask,
  type TrackerTaskDetail,
} from "@/lib/tracker-tasks/types";

export const MAX_JIRA_DESCRIPTION_LENGTH = 16_000;
export const JIRA_DESCRIPTION_TRUNCATION_MARKER = "\n...[truncated]";
/**
 * Depth ceiling for the ADF walker. Real descriptions nest three or four levels
 * (list > item > paragraph > text); anything past this is either pathological
 * or hostile, and the walker runs on renderer-adjacent data with no size
 * guarantee from the server.
 */
export const MAX_ADF_DEPTH = 12;

/**
 * Jira sends far more fields than we request, and every one of them is optional
 * from our point of view, so the shape is parsed non-strictly: unknown keys are
 * stripped rather than rejected, and a sub-object that fails its own shape
 * degrades to `null` instead of failing the row.
 */
const looseString = (max: number) =>
  z.string().trim().min(1).max(max).nullish().catch(null);

const looseObject = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).nullish().catch(null);

const JiraUserSchema = looseObject({
  accountId: looseString(128),
  displayName: looseString(200),
  emailAddress: looseString(320),
  avatarUrls: z.record(z.string(), z.string()).nullish().catch(null),
});

const JiraNamedSchema = looseObject({ name: looseString(200) });

const JiraStatusSchema = looseObject({
  name: looseString(200),
  statusCategory: looseObject({ key: looseString(64), name: looseString(64) }),
});

const JiraIssueSchema = z.object({
  key: z.string().trim().min(1).max(64),
  fields: z.object({
    summary: z.string().trim().min(1).max(10_000),
    status: JiraStatusSchema,
    priority: JiraNamedSchema,
    issuetype: JiraNamedSchema,
    assignee: JiraUserSchema,
    labels: z.array(z.string()).max(500).nullish().catch(null),
    duedate: looseString(64),
    created: looseString(64),
    updated: looseString(64),
    resolutiondate: looseString(64),
    project: looseObject({
      id: looseString(128),
      key: looseString(64),
      name: looseString(200),
    }),
    parent: looseObject({ key: looseString(64) }),
    description: z.unknown().optional(),
  }),
});

type JiraIssue = z.infer<typeof JiraIssueSchema>;

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Jira Cloud emits `2026-09-01T10:00:00.000+0900` - a four-digit offset with no
 * colon, which `z.string().datetime({ offset: true })` rejects. Every tracker
 * timestamp is validated with that check, so the offset is re-punctuated here
 * rather than loosening the shared contract for one source.
 */
export function normalizeJiraTimestamp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.exec(
      trimmed,
    );
  if (match) {
    const base = match[1] ?? "";
    const fraction = match[2];
    const offset = match[3] ?? "Z";
    // Trim to milliseconds: Jira Data Center can report microseconds, which the
    // shared datetime check also rejects.
    const millis = fraction
      ? `.${fraction.slice(1).padEnd(3, "0").slice(0, 3)}`
      : "";
    const zone =
      offset === "Z"
        ? "Z"
        : offset.includes(":")
          ? offset
          : `${offset.slice(0, 3)}:${offset.slice(3)}`;
    return `${base}${millis}${zone}`;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Grouping and colour read the status category alone.
 *
 * A Jira workflow can name a state anything, and installations rename the
 * defaults constantly, so trusting the free-text name for the bucket would make
 * an untranslated board render as all-todo. The name is consulted only to
 * separate review from generic in-progress, which is a display nicety - if it
 * guesses wrong the row is still in the right half of the list.
 */
export function toTrackerStatusCategory(args: {
  categoryKey: string | null;
  categoryName: string | null;
  statusName: string | null;
}): TrackerStatusCategory {
  const category = (args.categoryKey ?? args.categoryName ?? "")
    .trim()
    .toLowerCase();
  if (category === "done" || category === "complete") {
    return "done";
  }
  if (category === "indeterminate" || category === "in progress") {
    return /review|qa|verif/i.test(args.statusName ?? "")
      ? "in_review"
      : "in_progress";
  }
  return "todo";
}

export function toTrackerPriorityLevel(
  name: string | null,
): TrackerPriorityLevel {
  switch ((name ?? "").trim().toLowerCase()) {
    case "highest":
    case "blocker":
      return "urgent";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
    case "lowest":
    case "trivial":
    case "minor":
      return "low";
    default:
      return "none";
  }
}

function renderAdfNodes(nodes: unknown, depth: number, separator: string) {
  if (!Array.isArray(nodes)) return "";
  const parts: string[] = [];
  for (const node of nodes) {
    const rendered = renderAdfNode(node, depth);
    if (rendered.length > 0) parts.push(rendered);
  }
  return parts.join(separator);
}

function renderAdfText(node: Record<string, unknown>): string {
  const text = typeof node.text === "string" ? node.text : "";
  if (!text) return "";
  const marks = Array.isArray(node.marks) ? node.marks : [];
  for (const mark of marks) {
    if (!mark || typeof mark !== "object") continue;
    const typed = mark as { type?: unknown; attrs?: { href?: unknown } };
    if (typed.type !== "link") continue;
    const href = typed.attrs?.href;
    if (typeof href === "string" && /^https?:\/\//i.test(href)) {
      return `${text} (${href})`;
    }
  }
  return text;
}

function renderAdfList(
  node: Record<string, unknown>,
  depth: number,
  ordered: boolean,
): string {
  const items = Array.isArray(node.content) ? node.content : [];
  const attrs = node.attrs as { order?: unknown } | undefined;
  const start =
    ordered && typeof attrs?.order === "number" && Number.isFinite(attrs.order)
      ? Math.trunc(attrs.order)
      : 1;
  const lines: string[] = [];
  items.forEach((item, index) => {
    const body = renderAdfNode(item, depth + 1);
    if (!body) return;
    const bullet = ordered ? `${start + index}. ` : "- ";
    const indented = body
      .split("\n")
      .map((line, lineIndex) => (lineIndex === 0 ? line : `  ${line}`))
      .join("\n");
    lines.push(`${bullet}${indented}`);
  });
  return lines.join("\n");
}

function renderAdfNode(node: unknown, depth: number): string {
  // The cap is the only termination guarantee: a self-referential `content`
  // array is a plain object graph here, not a tree, and would otherwise recurse
  // until the stack dies.
  if (depth > MAX_ADF_DEPTH) return "";
  if (!node || typeof node !== "object") return "";
  const typed = node as Record<string, unknown>;
  switch (typed.type) {
    case "doc":
      return renderAdfNodes(typed.content, depth + 1, "\n\n");
    case "paragraph":
      return renderAdfNodes(typed.content, depth + 1, "");
    case "heading": {
      const attrs = typed.attrs as { level?: unknown } | undefined;
      const level =
        typeof attrs?.level === "number" && Number.isFinite(attrs.level)
          ? Math.min(Math.max(Math.trunc(attrs.level), 1), 6)
          : 2;
      const text = renderAdfNodes(typed.content, depth + 1, "");
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "bulletList":
      return renderAdfList(typed, depth, false);
    case "orderedList":
      return renderAdfList(typed, depth, true);
    case "listItem":
      return renderAdfNodes(typed.content, depth + 1, "\n");
    case "blockquote":
    case "panel":
      return renderAdfNodes(typed.content, depth + 1, "\n\n");
    case "codeBlock": {
      const attrs = typed.attrs as { language?: unknown } | undefined;
      const language =
        typeof attrs?.language === "string" ? attrs.language.trim() : "";
      const body = renderAdfNodes(typed.content, depth + 1, "");
      return `\`\`\`${language}\n${body}\n\`\`\``;
    }
    case "rule":
      return "---";
    case "hardBreak":
      return "\n";
    case "text":
      return renderAdfText(typed);
    default:
      return "";
  }
}

/**
 * Render an Atlassian Document Format description as plain text.
 *
 * Older REST shapes (and some third-party writers) send the description as a
 * bare string, so that case is accepted rather than treated as malformed.
 */
export function adfToPlainText(value: unknown): string {
  const raw =
    typeof value === "string" ? value.trim() : renderAdfNode(value, 0).trim();
  const collapsed = raw.replace(/\n{3,}/g, "\n\n");
  if (collapsed.length <= MAX_JIRA_DESCRIPTION_LENGTH) {
    return collapsed;
  }
  return (
    collapsed.slice(
      0,
      MAX_JIRA_DESCRIPTION_LENGTH - JIRA_DESCRIPTION_TRUNCATION_MARKER.length,
    ) + JIRA_DESCRIPTION_TRUNCATION_MARKER
  );
}

function toBaseTask(issue: JiraIssue, siteUrl: string) {
  const fields = issue.fields;
  const createdAt = normalizeJiraTimestamp(fields.created ?? null);
  const updatedAt = normalizeJiraTimestamp(fields.updated ?? null);
  // Both timestamps are required by the shared task contract, so a row with
  // neither is unmappable rather than backfilled with "now" - a synthetic date
  // would sort the row to the top of every "recently updated" view.
  const created = createdAt ?? updatedAt;
  const updated = updatedAt ?? createdAt;
  if (!created || !updated) return null;

  const statusName = fields.status?.name ?? null;
  const categoryName = fields.status?.statusCategory?.name ?? null;
  const rawStatus = statusName ?? categoryName;
  if (!rawStatus) return null;

  const avatarUrl = fields.assignee?.avatarUrls?.["48x48"];
  const assignee = fields.assignee?.accountId
    ? {
        id: fields.assignee.accountId,
        name: clamp(
          fields.assignee.displayName ?? fields.assignee.accountId,
          200,
        ),
        ...(fields.assignee.emailAddress
          ? { email: fields.assignee.emailAddress }
          : {}),
        ...(typeof avatarUrl === "string" && avatarUrl.startsWith("https://")
          ? { avatarUrl }
          : {}),
      }
    : null;

  const projectId = fields.project?.id ?? fields.project?.key ?? null;
  const projectName = fields.project?.name ?? fields.project?.key ?? null;

  const dueDate = fields.duedate?.trim() ?? null;

  return {
    source: "jira" as const,
    ref: issue.key,
    key: issue.key,
    title: clamp(fields.summary, 500),
    url: `${siteUrl.replace(/\/+$/, "")}/browse/${issue.key}`,
    status: {
      raw: clamp(rawStatus, 80),
      category: toTrackerStatusCategory({
        categoryKey: fields.status?.statusCategory?.key ?? null,
        categoryName,
        statusName,
      }),
    },
    priority: {
      raw: fields.priority?.name ? clamp(fields.priority.name, 80) : null,
      level: toTrackerPriorityLevel(fields.priority?.name ?? null),
    },
    assignee,
    labels: (fields.labels ?? [])
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .slice(0, 20)
      .map((label) => ({ name: clamp(label, 80) })),
    dueDate: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    // Jira story points live in a per-instance custom field, and there is no
    // stable id to read without a field-metadata round trip.
    effort: null,
    project:
      projectId && projectName
        ? { id: clamp(projectId, 128), name: clamp(projectName, 200) }
        : null,
    // Jira teams are a Premium field carried under a custom field id, so the
    // Crane-shaped team slot stays empty rather than guessing.
    team: null,
    parentKey: fields.parent?.key ?? null,
    subtasks: null,
    issueType: fields.issuetype?.name ? clamp(fields.issuetype.name, 80) : null,
    links: [],
    createdAt: created,
    updatedAt: updated,
    closedAt: normalizeJiraTimestamp(fields.resolutiondate ?? null),
  };
}

/**
 * Map one Jira issue, or `null` when it cannot be mapped.
 *
 * Never throws: a page of fifty issues must not be lost because one row has a
 * shape this build does not understand.
 */
export function toTrackerTaskFromJira(
  issue: unknown,
  siteUrl: string,
): TrackerTask | null {
  const parsed = JiraIssueSchema.safeParse(issue);
  if (!parsed.success) return null;
  const base = toBaseTask(parsed.data, siteUrl);
  if (!base) return null;
  const task = TrackerTaskSchema.safeParse(base);
  return task.success ? task.data : null;
}

export function toTrackerTaskDetailFromJira(
  issue: unknown,
  siteUrl: string,
): TrackerTaskDetail | null {
  const parsed = JiraIssueSchema.safeParse(issue);
  if (!parsed.success) return null;
  const base = toBaseTask(parsed.data, siteUrl);
  if (!base) return null;
  const detail = TrackerTaskDetailSchema.safeParse({
    ...base,
    description: adfToPlainText(parsed.data.fields.description),
  });
  return detail.success ? detail.data : null;
}
