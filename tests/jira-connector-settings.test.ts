import { describe, expect, test } from "bun:test";

import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  DEFAULT_JIRA_JQL,
  JiraConnectorPublicStatusSchema,
  JiraConnectorSetCredentialArgsSchema,
  JiraConnectorSettingsSchema,
  JiraConnectorTestConnectionArgsSchema,
  normalizeJiraConnectorSettings,
  normalizeJiraSiteUrl,
} from "../src/lib/jira-connector/types";

describe("normalizeJiraSiteUrl", () => {
  test("keeps a path prefix and strips trailing slashes", () => {
    expect(normalizeJiraSiteUrl("https://example.atlassian.net/")).toBe(
      "https://example.atlassian.net",
    );
    expect(normalizeJiraSiteUrl("  https://tools.example.com/jira///  ")).toBe(
      "https://tools.example.com/jira",
    );
  });

  test("rejects non-https, userinfo, query and fragment", () => {
    expect(() => normalizeJiraSiteUrl("http://example.atlassian.net")).toThrow(
      "HTTPS",
    );
    expect(() =>
      normalizeJiraSiteUrl("https://user:secret@example.atlassian.net"),
    ).toThrow("username and password");
    expect(() =>
      normalizeJiraSiteUrl("https://example.atlassian.net/?a=1"),
    ).toThrow("query and fragment");
    expect(() =>
      normalizeJiraSiteUrl("https://example.atlassian.net/#/browse"),
    ).toThrow("query and fragment");
    expect(() => normalizeJiraSiteUrl("not-a-url")).toThrow("valid Jira site");
  });
});

describe("JiraConnectorSettingsSchema", () => {
  test("applies JQL and page-size defaults", () => {
    const parsed = JiraConnectorSettingsSchema.parse({
      enabled: true,
      siteUrl: "https://example.atlassian.net",
      authMode: "cloud-api-token",
      projectMappings: [],
    });
    expect(parsed.jql).toBe(DEFAULT_JIRA_JQL);
    expect(parsed.maxResults).toBe(50);
  });

  test("rejects unknown keys and out-of-range page sizes", () => {
    const base = {
      enabled: false,
      siteUrl: "",
      authMode: "cloud-api-token",
      projectMappings: [],
    };
    expect(
      JiraConnectorSettingsSchema.safeParse({ ...base, token: "nope" }).success,
    ).toBe(false);
    expect(
      JiraConnectorSettingsSchema.safeParse({ ...base, maxResults: 101 })
        .success,
    ).toBe(false);
  });
});

describe("normalizeJiraConnectorSettings", () => {
  test("salvages one bad mapping without resetting the connector", () => {
    const normalized = normalizeJiraConnectorSettings({
      enabled: true,
      siteUrl: "https://example.atlassian.net/jira/",
      authMode: "cloud-api-token",
      jql: "  project = ABC  ",
      maxResults: 25,
      projectMappings: [
        { jiraProjectKey: "ABC", staveProjectPath: "/tmp/abc" },
        { jiraProjectKey: "", staveProjectPath: "/tmp/broken" },
        { jiraProjectKey: "DEF", staveProjectPath: "/tmp/def", unknown: true },
        {
          jiraProjectKey: "GHI",
          staveProjectPath: "/tmp/ghi",
          runtime: {
            provider: "codex",
            model: "gpt-test",
            effort: "medium",
          },
        },
      ],
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.siteUrl).toBe("https://example.atlassian.net/jira");
    expect(normalized.jql).toBe("project = ABC");
    expect(normalized.maxResults).toBe(25);
    expect(normalized.projectMappings.map((m) => m.jiraProjectKey)).toEqual([
      "ABC",
      "GHI",
    ]);
  });

  test("falls back to defaults when the document is unusable", () => {
    expect(normalizeJiraConnectorSettings(null)).toEqual({
      ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
      projectMappings: [],
    });
    expect(
      normalizeJiraConnectorSettings({
        enabled: true,
        siteUrl: "http://example.atlassian.net",
        authMode: "cloud-api-token",
        projectMappings: [],
      }).siteUrl,
    ).toBe("");
  });
});

describe("credential boundaries", () => {
  test("the public status carries no credential-shaped field", () => {
    const keys = Object.keys(JiraConnectorPublicStatusSchema.shape);
    expect(keys).toEqual([
      "configured",
      "secureStorageAvailable",
      "siteUrl",
      "accountId",
      "displayName",
      "lastErrorCode",
    ]);
    for (const key of keys) {
      expect(key).not.toMatch(/email|token|secret|password|credential/i);
    }
    expect(
      JiraConnectorPublicStatusSchema.safeParse({
        configured: true,
        secureStorageAvailable: true,
        siteUrl: "https://example.atlassian.net",
        accountId: "account-1",
        displayName: "Test User",
        lastErrorCode: null,
        email: "user@example.com",
      }).success,
    ).toBe(false);
  });

  test("credential args are strict and bounded", () => {
    expect(
      JiraConnectorSetCredentialArgsSchema.parse({
        email: "  user@example.com ",
        token: "test-only-token",
      }),
    ).toEqual({ email: "user@example.com", token: "test-only-token" });
    expect(
      JiraConnectorSetCredentialArgsSchema.safeParse({
        email: "user@example.com",
        token: "x".repeat(513),
      }).success,
    ).toBe(false);
    expect(JiraConnectorTestConnectionArgsSchema.safeParse({}).success).toBe(
      true,
    );
    expect(
      JiraConnectorTestConnectionArgsSchema.safeParse({ force: true }).success,
    ).toBe(false);
  });
});
