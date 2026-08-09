import { describe, expect, test } from "bun:test";

import {
  AtelierConnectorHttpClient,
  AtelierConnectorHttpError,
} from "../electron/main/atelier-connector/http-client";

const fixtureDirectory = new URL("./fixtures/stave-sync-v1/", import.meta.url);

async function readFixture(name: string) {
  return Bun.file(new URL(name, fixtureDirectory)).json();
}

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const SERVER_CONNECTOR = {
  id: "connector-1",
  name: "Personal Stave",
  secretPrefix: "stc_abcd",
  protocolVersion: 1,
  appVersion: "1.0.0",
  capabilities: ["run_task"],
  createdAt: "2026-08-09T00:00:00.000Z",
  lastSeenAt: "2026-08-09T00:00:00.000Z",
  revokedAt: null,
} as const;

describe("AtelierConnectorHttpClient", () => {
  test("exchanges requested scopes and defaults legacy responses to crane", async () => {
    const requests: Request[] = [];
    let includeScopes = true;
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse({
          connector: {
            ...SERVER_CONNECTOR,
            ...(includeScopes ? { scopes: ["crane", "hirondelle"] } : {}),
          },
          secret: "stc_test-only-secret",
          pollRetryMs: 15_000,
        });
      }) as typeof fetch,
    });

    const paired = await client.exchangePairingCode({
      code: "stp_test-only-code",
      name: "Personal Stave",
      appVersion: "1.0.0",
      requestedScopes: ["crane", "hirondelle"],
    });
    expect(paired.scopes).toEqual(["crane", "hirondelle"]);
    expect(await requests[0]?.json()).toMatchObject({
      requestedScopes: ["crane", "hirondelle"],
    });

    includeScopes = false;
    expect(
      (
        await client.exchangePairingCode({
          code: "stp_legacy-code",
          name: "Personal Stave",
          appVersion: "1.0.0",
          requestedScopes: ["crane", "hirondelle"],
        })
      ).scopes,
    ).toEqual(["crane"]);
  });

  test("lists contract-valid projects and rejects response drift", async () => {
    const requests: Request[] = [];
    const fixture = await readFixture("valid-project-list.json");
    let response = fixture;
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse(response);
      }) as typeof fetch,
    });

    const projects = await client.listHirondelleProjects({
      secret: "stc_test-only-secret",
      query: "alpha",
      limit: 10,
    });
    expect(requests[0]?.url).toBe(
      "https://atelier.example.test/api/hirondelle/stave/projects?query=alpha&limit=10",
    );
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer stc_test-only-secret",
    );
    expect(projects[0]).toMatchObject({
      ref: "sync-outbox",
      url: "https://atelier.example.test/apps/hirondelle/p/sync-outbox",
    });

    response = {
      ...fixture,
      projects: [{ ...fixture.projects[0], futureField: true }],
    };
    await expect(
      client.listHirondelleProjects({ secret: "stc_test-only-secret" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  test("allows bounded context bundles but rejects declared oversize responses", async () => {
    const fixture = await readFixture("valid-context-bundle.json");
    let response = jsonResponse({ ...fixture, markdown: "x".repeat(100_000) });
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async () => response) as typeof fetch,
    });
    expect(
      (
        await client.getHirondelleContextBundle({
          secret: "stc_test-only-secret",
          projectRef: "sync-outbox",
        })
      ).markdown,
    ).toHaveLength(100_000);

    response = new Response("{}", {
      status: 200,
      headers: { "Content-Length": "600000" },
    });
    await expect(
      client.getHirondelleContextBundle({
        secret: "stc_test-only-secret",
        projectRef: "sync-outbox",
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  test("posts validated events and returns per-item status", async () => {
    const requestFixture = await readFixture("valid-events-request.json");
    const responseFixture = await readFixture("valid-events-response.json");
    const requests: Request[] = [];
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse(responseFixture);
      }) as typeof fetch,
    });

    expect(
      await client.postHirondelleEvents({
        secret: "stc_test-only-secret",
        projectRef: "sync-outbox",
        events: requestFixture.events,
      }),
    ).toEqual(responseFixture.results);
    expect(await requests[0]?.json()).toEqual(requestFixture);

    await expect(
      client.postHirondelleEvents({
        secret: "stc_test-only-secret",
        projectRef: "sync-outbox",
        events: Array.from({ length: 21 }, (_, index) => ({
          ...requestFixture.events[0],
          staveEventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
      }),
    ).rejects.toBeDefined();
    expect(requests).toHaveLength(1);
  });

  test("merges links and aggregates actions", async () => {
    const requestFixture = await readFixture("valid-links-merge-request.json");
    const requests: Request[] = [];
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse({
          contract: requestFixture.contract,
          results: [
            { url: requestFixture.links[0].url, action: "inserted" },
            { url: requestFixture.links[1].url, action: "updated" },
            { url: "https://example.test/human", action: "skipped" },
          ],
        });
      }) as typeof fetch,
    });
    expect(
      await client.mergeHirondelleLinks({
        secret: "stc_test-only-secret",
        projectRef: "sync-outbox",
        links: requestFixture.links,
      }),
    ).toEqual({ ok: true, inserted: 1, updated: 1, skipped: 1 });
    expect(await requests[0]?.json()).toEqual({
      ...requestFixture,
      links: requestFixture.links.map((link: { note?: string }) => ({
        ...link,
        note: link.note ?? "",
      })),
    });
  });

  test("normalizes remote and network errors without leaking secrets", async () => {
    let rejectNetwork = false;
    const client = new AtelierConnectorHttpClient({
      baseUrl: "https://atelier.example.test",
      fetch: (async () => {
        if (rejectNetwork) throw new Error("offline stc_never-surface");
        return jsonResponse({ error: "forbidden" }, { status: 403 });
      }) as typeof fetch,
    });
    await expect(
      client.listHirondelleProjects({ secret: "stc_test-only-secret" }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    rejectNetwork = true;
    await expect(
      client.listHirondelleProjects({ secret: "stc_test-only-secret" }),
    ).rejects.toMatchObject({ code: "network_unavailable", status: 0 });
  });

  test("requires HTTPS except explicit localhost development", () => {
    expect(
      () =>
        new AtelierConnectorHttpClient({
          baseUrl: "http://atelier.example.test",
        }),
    ).toThrow("HTTPS");
    expect(
      () =>
        new AtelierConnectorHttpClient({
          baseUrl: "http://localhost:8181",
          allowInsecureLocalhost: true,
        }),
    ).not.toThrow();
    expect(
      new AtelierConnectorHttpError("forbidden", 403).message,
    ).not.toContain("stc_");
  });
});
