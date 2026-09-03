import { z } from "zod";

import { CraneTeamRuntimeMemorySchema } from "@/lib/crane-connector/types";

export const DEFAULT_JIRA_JQL =
  "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
export const DEFAULT_JIRA_MAX_RESULTS = 50;
export const MAX_JIRA_MAX_RESULTS = 100;

/**
 * Normalize a Jira site URL to the form every request is built from.
 *
 * Kept separate from the Crane base-URL helper because the two have different
 * rules: a Jira site is frequently served under a path prefix (a reverse proxy
 * mounting it at `/jira`), so the path must survive, while userinfo, query and
 * fragment must not - they would be replayed on every API call and a
 * credential smuggled in `https://user:pass@site` would end up in the vault
 * document as part of the site URL.
 */
export function normalizeJiraSiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid Jira site URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("The Jira site URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Remove the username and password from the Jira site URL.");
  }
  if (url.search || url.hash) {
    throw new Error("Remove the query and fragment from the Jira site URL.");
  }
  const pathPrefix = url.pathname.replace(/\/+$/, "");
  const normalized = `${url.origin}${pathPrefix}`;
  if (normalized.length > 2_048) {
    throw new Error("The Jira site URL is too long.");
  }
  return normalized;
}

/**
 * An empty string is accepted as "not set yet" rather than being rejected: the
 * connector ships disabled with no site, and the Settings form has to be able
 * to persist the rest of the row (JQL, mappings) before a site is entered.
 */
const SiteUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .superRefine((value, context) => {
    if (value.length === 0) return;
    try {
      normalizeJiraSiteUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Enter a valid Jira site URL.",
      });
    }
  })
  .transform((value) =>
    value.length === 0 ? "" : normalizeJiraSiteUrl(value),
  );

export const JiraProjectMappingSchema = z
  .object({
    jiraProjectKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Enter a Jira project key."),
    staveProjectPath: z.string().trim().min(1).max(4_096),
    runtime: CraneTeamRuntimeMemorySchema.optional(),
  })
  .strict();

export const JiraConnectorSettingsSchema = z
  .object({
    enabled: z.boolean(),
    siteUrl: SiteUrlSchema,
    /**
     * A single-member enum on purpose. Cloud API tokens are the only supported
     * credential today, but Data Center PATs and OAuth are the obvious next
     * ones; encoding the mode now makes adding them an enum widening that
     * stored documents survive, instead of a document-shape break.
     */
    authMode: z.enum(["cloud-api-token"]),
    jql: z.string().trim().max(2_000).default(DEFAULT_JIRA_JQL),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(MAX_JIRA_MAX_RESULTS)
      .default(DEFAULT_JIRA_MAX_RESULTS),
    projectMappings: z.array(JiraProjectMappingSchema).max(100),
  })
  .strict();

export type JiraConnectorSettings = z.infer<typeof JiraConnectorSettingsSchema>;
export type JiraProjectMapping = z.infer<typeof JiraProjectMappingSchema>;

export const DEFAULT_JIRA_CONNECTOR_SETTINGS = Object.freeze({
  enabled: false,
  siteUrl: "",
  authMode: "cloud-api-token",
  jql: DEFAULT_JIRA_JQL,
  maxResults: DEFAULT_JIRA_MAX_RESULTS,
  projectMappings: [],
}) satisfies JiraConnectorSettings;

export function normalizeJiraConnectorSettings(
  value: unknown,
): JiraConnectorSettings {
  const parsed = JiraConnectorSettingsSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  // One unreadable mapping - typically written by a newer build that knows a
  // runtime field this one does not - must not take the site URL and enabled
  // flag down with it. Salvage per element and drop only what fails.
  const salvaged = JiraConnectorSettingsSchema.safeParse({
    ...(value && typeof value === "object" ? value : {}),
    projectMappings: Array.isArray(
      (value as { projectMappings?: unknown })?.projectMappings,
    )
      ? (value as { projectMappings: unknown[] }).projectMappings.filter(
          (mapping) => JiraProjectMappingSchema.safeParse(mapping).success,
        )
      : [],
  });
  return salvaged.success
    ? salvaged.data
    : { ...DEFAULT_JIRA_CONNECTOR_SETTINGS, projectMappings: [] };
}

/**
 * What the renderer is allowed to know about the connection.
 *
 * The email and the API token are absent by construction, not by omission: this
 * schema is the boundary the credential must never cross, so the renderer can
 * render a "connected as" line without ever holding material that can
 * authenticate against the Jira site.
 */
export const JiraConnectorPublicStatusSchema = z
  .object({
    configured: z.boolean(),
    secureStorageAvailable: z.boolean(),
    siteUrl: z.string().trim().min(1).max(2_048).nullable(),
    accountId: z.string().trim().min(1).max(128).nullable(),
    displayName: z.string().trim().min(1).max(200).nullable(),
    lastErrorCode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export type JiraConnectorPublicStatus = z.infer<
  typeof JiraConnectorPublicStatusSchema
>;

export const JiraConnectorSetCredentialArgsSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    token: z.string().min(1).max(512),
  })
  .strict();

export const JiraConnectorTestConnectionArgsSchema = z.object({}).strict();

export const JiraConnectorConfigureArgsSchema = JiraConnectorSettingsSchema;

export type JiraConnectorSetCredentialArgs = z.infer<
  typeof JiraConnectorSetCredentialArgsSchema
>;
export type JiraConnectorTestConnectionArgs = z.infer<
  typeof JiraConnectorTestConnectionArgsSchema
>;
export type JiraConnectorConfigureArgs = z.infer<
  typeof JiraConnectorConfigureArgsSchema
>;
