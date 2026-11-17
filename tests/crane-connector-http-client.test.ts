import { describe, expect, test } from "bun:test";
import {
  CraneConnectorHttpClient,
  CraneConnectorHttpError,
  normalizeCraneConnectorBaseUrl,
} from "../electron/main/crane-connector/http-client";

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

/**
 * The body Crane's exchange route answers with (`staveConnectorRow` in
 * Atelier's `apps/crane/src/server/stave-dispatch-auth.mjs`). Crane has sent
 * `scopes` on every connector row since Atelier added connector scopes, so a fixture
 * without it no longer describes the server.
 */
const CRANE_EXCHANGE_RESPONSE = Object.freeze({
  connector: {
    id: "connector-1",
    name: "Local Stave",
    secretPrefix: "stc_abcd",
    protocolVersion: 1,
    appVersion: "1.0.0",
    capabilities: ["run_task"],
    scopes: ["crane"],
    createdAt: "2026-07-26T00:00:00.000Z",
    lastSeenAt: "2026-07-26T00:00:00.000Z",
    revokedAt: null,
  },
  secret: "stc_test-only-connector-secret",
  pollRetryMs: 15_000,
});

const CLAIM_FIXTURE_URL = new URL(
  "./fixtures/crane-tasks-v1/task-job-claim.json",
  import.meta.url,
);

describe("CraneConnectorHttpClient", () => {
  test("requires HTTPS except localhost development", () => {
    expect(
      normalizeCraneConnectorBaseUrl("https://atelier.sdix.io/"),
    ).toBe("https://atelier.sdix.io");
    expect(() =>
      normalizeCraneConnectorBaseUrl("http://atelier.example"),
    ).toThrow("HTTPS");
    expect(
      normalizeCraneConnectorBaseUrl("http://localhost:8181", {
        allowInsecureLocalhost: true,
      }),
    ).toBe("http://localhost:8181");
    expect(() =>
      normalizeCraneConnectorBaseUrl(
        "https://atelier.sdix.io/apps/crane",
      ),
    ).toThrow("without a path");
  });

  test("exchanges a pairing code without leaking it into errors", async () => {
    const requests: Request[] = [];
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse(CRANE_EXCHANGE_RESPONSE, { status: 201 });
      }) as typeof fetch,
    });

    const result = await client.exchangePairingCode({
      code: "stp_test-only-pairing-code",
      name: "Local Stave",
      appVersion: "1.0.0",
    });

    expect(result.connector).toEqual({
      id: "connector-1",
      name: "Local Stave",
      protocolVersion: 1,
      appVersion: "1.0.0",
      capabilities: ["run_task"],
      createdAt: "2026-07-26T00:00:00.000Z",
      lastSeenAt: "2026-07-26T00:00:00.000Z",
    });
    expect(result.secret).toBe("stc_test-only-connector-secret");
    expect(requests[0]?.url).toBe(
      "https://api.atelier.sdix.io/api/crane/stave/connectors/exchange",
    );
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  test("sends requests for the UI host to the API host and keeps other hosts", async () => {
    const urls: string[] = [];
    const recordingFetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    for (const baseUrl of [
      "https://atelier.sdix.io/",
      "https://atelier.example.test",
      "http://localhost:8181",
    ]) {
      await new CraneConnectorHttpClient({
        baseUrl,
        fetch: recordingFetch,
        allowInsecureLocalhost: true,
      }).getNextJob({ secret: "stc_test-only-connector-secret" });
    }

    expect(urls).toEqual([
      "https://api.atelier.sdix.io/api/crane/stave/connectors/jobs/next",
      "https://atelier.example.test/api/crane/stave/connectors/jobs/next",
      "http://localhost:8181/api/crane/stave/connectors/jobs/next",
    ]);
  });

  test("records the tasks-list capability from an idle poll header", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async () =>
        new Response(null, {
          status: 204,
          headers: { "X-Crane-Tasks-Enabled": "0" },
        })) as typeof fetch,
    });
    expect(client.getLastTasksEnabled()).toBeNull();
    expect(
      await client.getNextJob({
        secret: "stc_test-only-connector-secret",
      }),
    ).toBeNull();
    expect(client.getLastTasksEnabled()).toBe(false);
  });

  test("accepts a heartbeat tasksEnabled field and ignores unknown extras", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async () =>
        jsonResponse({
          ok: true,
          retryAfterMs: 15_000,
          tasksEnabled: true,
          futureCapability: "ignore-me",
        })) as typeof fetch,
    });
    const heartbeat = await client.heartbeat({
      secret: "stc_test-only-connector-secret",
    });
    expect(heartbeat.tasksEnabled).toBe(true);
    expect(client.getLastTasksEnabled()).toBe(true);
  });

  test("keeps additive Crane response fields from failing a committed exchange, claim, receipt or revoke", async () => {
    const claim = await Bun.file(CLAIM_FIXTURE_URL).json();
    const bodies: Record<string, unknown> = {
      "/api/crane/stave/connectors/exchange": {
        ...CRANE_EXCHANGE_RESPONSE,
        connector: {
          ...CRANE_EXCHANGE_RESPONSE.connector,
          futureConnectorField: "ignore-me",
        },
        futureExchangeField: { nested: true },
      },
      "/api/crane/stave/connectors/jobs/next": {
        job: claim.job,
        retryAfterMs: 0,
        futureNextField: 1,
      },
      [`/api/crane/stave/connectors/jobs/${claim.job.id}/claim`]: {
        ...claim,
        futureClaimField: "ignore-me",
      },
      [`/api/crane/stave/connectors/jobs/${claim.job.id}/receipts`]: {
        ok: true,
        duplicate: false,
        jobState: "running",
        sequence: 1,
        nextSequence: 2,
        futureReceiptField: "ignore-me",
      },
      "/api/crane/stave/connectors/self": {
        ok: true,
        futureRevokeField: "ignore-me",
      },
    };
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async (input) =>
        jsonResponse(bodies[new URL(String(input)).pathname])) as typeof fetch,
    });
    const secret = "stc_test-only-connector-secret";

    const exchanged = await client.exchangePairingCode({
      code: "stp_test-only-pairing-code",
      name: "Local Stave",
      appVersion: "1.0.0",
    });
    expect(exchanged.secret).toBe(secret);
    expect(exchanged.connector).not.toHaveProperty("futureConnectorField");
    expect(exchanged.connector).not.toHaveProperty("scopes");

    const next = await client.getNextJob({ secret });
    expect(next?.job.id).toBe(claim.job.id);
    expect(next).not.toHaveProperty("futureNextField");

    const claimed = await client.claimJob({ secret, jobId: claim.job.id });
    expect(claimed.leaseId).toBe(claim.leaseId);
    expect(claimed).not.toHaveProperty("futureClaimField");

    const receipt = await client.postReceipt({
      secret,
      jobId: claim.job.id,
      leaseId: claim.leaseId,
      receipt: {
        version: 1,
        jobId: claim.job.id,
        connectorId: claim.job.connectorId,
        sequence: 1,
        state: "running",
        occurredAt: "2026-02-25T12:01:00+00:00",
      },
    });
    expect(receipt.nextSequence).toBe(2);
    expect(receipt).not.toHaveProperty("futureReceiptField");

    expect(await client.revokeSelf({ secret })).toEqual({ ok: true });
  });

  test("still rejects an exchange whose known fields are wrong", async () => {
    for (const body of [
      { ...CRANE_EXCHANGE_RESPONSE, secret: "not-a-connector-secret" },
      {
        ...CRANE_EXCHANGE_RESPONSE,
        connector: { ...CRANE_EXCHANGE_RESPONSE.connector, protocolVersion: 2 },
      },
      { connector: CRANE_EXCHANGE_RESPONSE.connector, pollRetryMs: 15_000 },
    ]) {
      const client = new CraneConnectorHttpClient({
        baseUrl: "https://atelier.sdix.io",
        fetch: (async () => jsonResponse(body)) as typeof fetch,
      });
      await expect(
        client.exchangePairingCode({
          code: "stp_test-only-pairing-code",
          name: "Local Stave",
          appVersion: "1.0.0",
        }),
      ).rejects.toMatchObject({ code: "invalid_response" });
    }
  });

  test("uses the narrow connector bearer token and parses no-content polls", async () => {
    const requests: Request[] = [];
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });

    expect(
      await client.getNextJob({
        secret: "stc_test-only-connector-secret",
      }),
    ).toBeNull();
    expect(requests[0]?.headers.get("authorization")).toBe(
      "Bearer stc_test-only-connector-secret",
    );
  });

  test("returns only a stable error code for remote failures", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async () =>
        jsonResponse(
          {
            error: "unauthorized",
            detail: "stc_test-only-should-never-appear-in-client-errors",
          },
          { status: 401 },
        )) as typeof fetch,
    });

    try {
      await client.heartbeat({
        secret: "stc_test-only-connector-secret",
      });
      throw new Error("Expected heartbeat to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(CraneConnectorHttpError);
      expect((error as Error).message).toBe(
        "Crane connector request failed (unauthorized).",
      );
      expect((error as Error).message).not.toContain("stc_");
    }
  });

  test("rejects oversized response bodies before parsing", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      fetch: (async () =>
        new Response("x".repeat(25_000), {
          status: 200,
          headers: { "Content-Length": "25000" },
        })) as typeof fetch,
    });

    await expect(
      client.getNextJob({
        secret: "stc_test-only-connector-secret",
      }),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  test("bounds stalled outbound requests", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.sdix.io",
      requestTimeoutMs: 5,
      fetch: ((_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        })) as typeof fetch,
    });

    await expect(
      client.getNextJob({
        secret: "stc_test-only-connector-secret",
      }),
    ).rejects.toMatchObject({ code: "network_unavailable" });
  });
});
