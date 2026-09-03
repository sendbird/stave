import { describe, expect, test } from "bun:test";

import {
  JiraHttpClient,
  JiraHttpError,
  parseJiraRetryAfterMs,
} from "../electron/main/jira-connector/http-client";

const SITE_URL = "https://example.atlassian.net";
const EMAIL = "user@example.com";
const TOKEN = "test-only-api-token";

interface Call {
  url: URL;
  init: RequestInit;
}

function stubFetch(
  responder: (call: Call) => Response | Promise<Response>,
  calls: Call[] = [],
) {
  const impl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init: init ?? {} };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function client(
  responder: (call: Call) => Response | Promise<Response>,
  siteUrl = SITE_URL,
) {
  const { impl, calls } = stubFetch(responder);
  return {
    calls,
    client: new JiraHttpClient({ siteUrl, fetch: impl, requestTimeoutMs: 500 }),
  };
}

describe("JiraHttpClient happy paths", () => {
  test("getMyself authenticates with basic auth and returns only public identity", async () => {
    const harness = client(() =>
      jsonResponse({
        accountId: "account-1",
        displayName: "Test User",
        emailAddress: EMAIL,
        locale: "en_US",
      }),
    );

    const identity = await harness.client.getMyself({
      email: EMAIL,
      token: TOKEN,
    });

    expect(identity).toEqual({
      accountId: "account-1",
      displayName: "Test User",
    });
    const call = harness.calls[0]!;
    expect(call.url.pathname).toBe("/rest/api/3/myself");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`, "utf8").toString("base64")}`,
    );
  });

  test("searchIssues sends the JQL, page size and field list", async () => {
    const harness = client(() =>
      jsonResponse({
        issues: [{ key: "ABC-1" }, { key: "ABC-2" }],
        nextPageToken: "token-2",
      }),
    );

    const page = await harness.client.searchIssues({
      email: EMAIL,
      token: TOKEN,
      jql: "assignee = currentUser()",
      maxResults: 25,
      nextPageToken: "token-1",
    });

    expect(page.issues).toHaveLength(2);
    expect(page.nextPageToken).toBe("token-2");
    expect(page.hasMore).toBe(true);
    const url = harness.calls[0]!.url;
    expect(url.pathname).toBe("/rest/api/3/search/jql");
    expect(url.searchParams.get("jql")).toBe("assignee = currentUser()");
    expect(url.searchParams.get("maxResults")).toBe("25");
    expect(url.searchParams.get("nextPageToken")).toBe("token-1");
    expect(url.searchParams.get("fields")).toBe(
      "summary,status,priority,issuetype,assignee,labels,duedate,updated,created,resolutiondate,project,parent",
    );
  });

  test("searchIssues reports the last page as complete", async () => {
    const harness = client(() => jsonResponse({ issues: [], isLast: true }));
    const page = await harness.client.searchIssues({
      email: EMAIL,
      token: TOKEN,
      jql: "project = ABC",
      maxResults: 50,
    });
    expect(page).toEqual({ issues: [], nextPageToken: null, hasMore: false });
  });

  test("getIssue asks for the description and honours a site path prefix", async () => {
    const harness = client(
      () => jsonResponse({ key: "ABC-1", fields: { summary: "s" } }),
      "https://tools.example.com/jira/",
    );

    const issue = await harness.client.getIssue({
      email: EMAIL,
      token: TOKEN,
      key: "ABC-1",
    });

    expect(issue).toEqual({ key: "ABC-1", fields: { summary: "s" } });
    const url = harness.calls[0]!.url;
    expect(url.pathname).toBe("/jira/rest/api/3/issue/ABC-1");
    expect(url.searchParams.get("fields")).toContain("description");
  });
});

describe("JiraHttpClient error codes", () => {
  const statusCases: Array<[number, string]> = [
    [400, "invalid_jql"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
    [418, "request_failed"],
  ];

  for (const [status, code] of statusCases) {
    test(`maps HTTP ${status} to ${code}`, async () => {
      const harness = client(
        () =>
          new Response(JSON.stringify({ errorMessages: [`secret ${TOKEN}`] }), {
            status,
          }),
      );
      const error = (await harness.client
        .getMyself({ email: EMAIL, token: TOKEN })
        .catch((caught) => caught)) as JiraHttpError;
      expect(error).toBeInstanceOf(JiraHttpError);
      expect(error.code).toBe(code);
      expect(error.status).toBe(status);
    });
  }

  test("reads Retry-After as seconds and as an HTTP-date", async () => {
    const seconds = client(
      () =>
        new Response(null, { status: 429, headers: { "retry-after": "30" } }),
    );
    const secondsError = (await seconds.client
      .getMyself({ email: EMAIL, token: TOKEN })
      .catch((caught) => caught)) as JiraHttpError;
    expect(secondsError.retryAfterMs).toBe(30_000);

    const httpDate = new Date(Date.now() + 60_000).toUTCString();
    const dated = client(
      () =>
        new Response(null, {
          status: 429,
          headers: { "retry-after": httpDate },
        }),
    );
    const datedError = (await dated.client
      .getMyself({ email: EMAIL, token: TOKEN })
      .catch((caught) => caught)) as JiraHttpError;
    expect(datedError.retryAfterMs).toBeGreaterThan(50_000);
    expect(datedError.retryAfterMs).toBeLessThanOrEqual(60_000);

    expect(parseJiraRetryAfterMs(null)).toBeUndefined();
    expect(parseJiraRetryAfterMs("not-a-date")).toBeUndefined();
    expect(parseJiraRetryAfterMs("99999")).toBe(300_000);
  });

  test("rejects an oversize response before parsing it", async () => {
    const declared = client(
      () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": "999999" },
        }),
    );
    await expect(
      declared.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "response_too_large" });

    const streamed = client(() =>
      jsonResponse({ accountId: "a", padding: "x".repeat(30_000) }),
    );
    await expect(
      streamed.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  test("reports unreadable payloads and unreachable hosts", async () => {
    const badJson = client(() => new Response("<html>nope</html>"));
    await expect(
      badJson.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "invalid_response" });

    const badShape = client(() => jsonResponse({ displayName: "no id" }));
    await expect(
      badShape.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "invalid_response" });

    const offline = client(() => {
      throw new TypeError("fetch failed");
    });
    await expect(
      offline.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "network_unavailable" });
  });

  test("treats a timeout as unreachable and rethrows a caller abort", async () => {
    // The stub honours the abort signal the way a real fetch does; otherwise
    // the request timeout has nothing to interrupt.
    const slow = client(
      (call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    await expect(
      slow.client.getMyself({ email: EMAIL, token: TOKEN }),
    ).rejects.toMatchObject({ code: "network_unavailable" });

    const controller = new AbortController();
    const aborting = client(async (call) => {
      controller.abort();
      call.init.signal?.throwIfAborted();
      return jsonResponse({});
    });
    await expect(
      aborting.client.getMyself({
        email: EMAIL,
        token: TOKEN,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("credential leakage", () => {
  test("the token never reaches the thrown error", async () => {
    const harness = client(
      () =>
        new Response(
          JSON.stringify({
            errorMessages: [`Basic auth failed for ${EMAIL} / ${TOKEN}`],
          }),
          { status: 401 },
        ),
    );

    const error = (await harness.client
      .searchIssues({
        email: EMAIL,
        token: TOKEN,
        jql: "assignee = currentUser()",
        maxResults: 10,
      })
      .catch((caught) => caught)) as JiraHttpError;

    const serialized = `${error.message}|${JSON.stringify(error)}|${String(
      error.stack,
    )}`;
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(EMAIL);
    expect(error.message).toBe("Jira request failed (unauthorized).");
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: "JiraHttpError",
      code: "unauthorized",
      status: 401,
    });
  });
});
