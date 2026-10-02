import { describe, expect, test } from "bun:test";
import {
  normalizeEmail,
  normalizePlan,
  parseClaudeAuthStatus,
  parseCodexLoginStatus,
  readCodexIdentityClaims,
} from "../electron/provider-accounts/identity-parse";

// Every value below is fabricated. No real credential file is read by these tests.
const SECRETS = ["SENTINEL-ACCESS-TOKEN", "SENTINEL-REFRESH-TOKEN", "sk-SENTINEL-API-KEY", "SENTINEL-ACCOUNT-ID"];

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function fabricatedJwt(payload: Record<string, unknown>) {
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url(payload)}.SENTINEL-SIGNATURE`;
}
function fabricatedAuthFile(payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    OPENAI_API_KEY: null,
    tokens: {
      id_token: fabricatedJwt(payload),
      access_token: "SENTINEL-ACCESS-TOKEN",
      refresh_token: "SENTINEL-REFRESH-TOKEN",
      account_id: "SENTINEL-ACCOUNT-ID",
    },
    last_refresh: "2026-10-01T00:00:00Z",
    ...extra,
  });
}
function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe("claude auth status parsing", () => {
  test("reads email and plan from a signed-in answer", () => {
    expect(
      parseClaudeAuthStatus(
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          apiProvider: "firstParty",
          email: "dev@example.com",
          subscriptionType: "max",
          configDirectory: "/tmp/account-folder",
        }),
      ),
    ).toEqual({ state: "signed-in", email: "dev@example.com", plan: "Max" });
  });

  test("shows nothing for fields that are missing or the wrong type", () => {
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true }))).toEqual({ state: "signed-in", email: null, plan: null });
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, email: "dev@example.com" }))).toEqual({
      state: "signed-in",
      email: "dev@example.com",
      plan: null,
    });
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, subscriptionType: "team" }))).toEqual({
      state: "signed-in",
      email: null,
      plan: "Team",
    });
    expect(
      parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, email: 42, subscriptionType: { tier: "max" } })),
    ).toEqual({ state: "signed-in", email: null, plan: null });
    expect(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, email: "not an address", subscriptionType: null }))).toEqual({
      state: "signed-in",
      email: null,
      plan: null,
    });
  });

  test("reports signed out without needing any identity field", () => {
    expect(
      parseClaudeAuthStatus(
        JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty", configDirectory: "/tmp/x" }),
      ),
    ).toEqual({ state: "signed-out" });
  });

  test("finds the JSON when a warning surrounds it", () => {
    const answer = JSON.stringify({ loggedIn: true, email: "dev@example.com" });
    expect(parseClaudeAuthStatus(`update available\n${answer}\n`)).toEqual({
      state: "signed-in",
      email: "dev@example.com",
      plan: null,
    });
  });

  test("does not guess when the answer has no usable loggedIn flag", () => {
    for (const text of ["", "Not logged in.", "[]", "{}", '{"loggedIn":"true"}', '{"email":"dev@example.com"}', "{not json"]) {
      expect(parseClaudeAuthStatus(text)).toEqual({ state: "unreadable" });
    }
  });
});

describe("plan and email normalization", () => {
  test("formats plan labels and drops unfamiliar shapes", () => {
    expect(normalizePlan("pro")).toBe("Pro");
    expect(normalizePlan("MAX")).toBe("Max");
    expect(normalizePlan("enterprise_plus")).toBe("Enterprise plus");
    expect(normalizePlan("  team ")).toBe("Team");
    expect(normalizePlan("")).toBeNull();
    expect(normalizePlan("x".repeat(40))).toBeNull();
    expect(normalizePlan("<script>")).toBeNull();
    expect(normalizePlan(7)).toBeNull();
  });

  test("keeps only address-shaped emails", () => {
    expect(normalizeEmail(" dev@example.com ")).toBe("dev@example.com");
    expect(normalizeEmail("dev@example")).toBeNull();
    expect(normalizeEmail("a b@example.com")).toBeNull();
    expect(normalizeEmail('"dev"@example.com')).toBeNull();
    expect(normalizeEmail(`${"a".repeat(260)}@example.com`)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("codex login status parsing", () => {
  test("classifies the login without keeping any text", () => {
    expect(parseCodexLoginStatus({ status: 0, text: "Logged in using ChatGPT" })).toEqual({ state: "signed-in", method: "chatgpt" });
    expect(parseCodexLoginStatus({ status: 0, text: "Logged in using an API key - sk-***ABCDE" })).toEqual({
      state: "signed-in",
      method: "api-key",
    });
    expect(parseCodexLoginStatus({ status: 0, text: "ok" })).toEqual({ state: "signed-in", method: "other" });
    expect(parseCodexLoginStatus({ status: 1, text: "Not logged in" })).toEqual({ state: "signed-out" });
    expect(parseCodexLoginStatus({ status: 2, text: "boom" })).toEqual({ state: "unreadable" });
    expect(parseCodexLoginStatus({ status: null, text: "" })).toEqual({ state: "unreadable" });
  });
});

describe("codex token claim extraction", () => {
  test("returns only the email and plan from a fabricated id token", () => {
    const file = fabricatedAuthFile({
      email: "dev@example.com",
      email_verified: true,
      sub: "SENTINEL-SUBJECT",
      "https://api.openai.com/auth": {
        chatgpt_plan_type: "plus",
        chatgpt_account_id: "SENTINEL-ACCOUNT-ID",
        organizations: [{ id: "org-SENTINEL", title: "Personal" }],
      },
    });
    const claims = readCodexIdentityClaims(file);
    expect(claims).toEqual({ email: "dev@example.com", plan: "Plus" });
    expect(Object.keys(claims!).sort()).toEqual(["email", "plan"]);
    expectNoSecrets(claims);
    expect(JSON.stringify(claims)).not.toContain("SENTINEL-SUBJECT");
    expect(JSON.stringify(claims)).not.toContain("org-SENTINEL");
  });

  test("falls back to the profile claim and tolerates a missing plan", () => {
    const claims = readCodexIdentityClaims(
      fabricatedAuthFile({ "https://api.openai.com/profile": { email: "profile@example.com" } }),
    );
    expect(claims).toEqual({ email: "profile@example.com", plan: null });
  });

  test("never surfaces an API key, even when the file holds one beside the tokens", () => {
    const claims = readCodexIdentityClaims(
      fabricatedAuthFile({ email: "dev@example.com" }, { OPENAI_API_KEY: "sk-SENTINEL-API-KEY" }),
    );
    expectNoSecrets(claims);
    expect(claims).toEqual({ email: "dev@example.com", plan: null });
  });

  test("returns null for files without an id token instead of echoing anything", () => {
    for (const text of [
      JSON.stringify({ OPENAI_API_KEY: "sk-SENTINEL-API-KEY" }),
      JSON.stringify({ tokens: { access_token: "SENTINEL-ACCESS-TOKEN" } }),
      JSON.stringify({ tokens: { id_token: "SENTINEL-ACCESS-TOKEN" } }),
      JSON.stringify({ tokens: { id_token: "a.b.c" } }),
      JSON.stringify([]),
      "SENTINEL-ACCESS-TOKEN",
      "",
    ]) {
      const claims = readCodexIdentityClaims(text);
      expect(claims === null || (claims.email === null && claims.plan === null)).toBe(true);
      expectNoSecrets(claims);
    }
  });

  test("refuses an oversized token and a payload that is not an object", () => {
    expect(readCodexIdentityClaims(JSON.stringify({ tokens: { id_token: `a.${"b".repeat(20_000)}.c` } }))).toBeNull();
    const notObject = `${base64url({ alg: "none" })}.${base64url(["dev@example.com"])}.sig`;
    expect(readCodexIdentityClaims(JSON.stringify({ tokens: { id_token: notObject } }))).toBeNull();
  });
});
