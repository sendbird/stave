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

describe("CraneConnectorHttpClient", () => {
  test("requires HTTPS except localhost development", () => {
    expect(
      normalizeCraneConnectorBaseUrl("https://atelier.delight-tools.ai/"),
    ).toBe("https://atelier.delight-tools.ai");
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
        "https://atelier.delight-tools.ai/apps/crane",
      ),
    ).toThrow("without a path");
  });

  test("exchanges a pairing code without leaking it into errors", async () => {
    const requests: Request[] = [];
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.delight-tools.ai",
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return jsonResponse({
          connector: {
            id: "connector-1",
            name: "Local Stave",
            secretPrefix: "stc_abcd",
            protocolVersion: 1,
            appVersion: "1.0.0",
            capabilities: ["run_task"],
            createdAt: "2026-07-26T00:00:00.000Z",
            lastSeenAt: "2026-07-26T00:00:00.000Z",
            revokedAt: null,
          },
          secret: "stc_test-only-connector-secret",
          pollRetryMs: 15_000,
        });
      }) as typeof fetch,
    });

    const result = await client.exchangePairingCode({
      code: "stp_test-only-pairing-code",
      name: "Local Stave",
      appVersion: "1.0.0",
    });

    expect(result.connector.id).toBe("connector-1");
    expect(result.secret).toBe("stc_test-only-connector-secret");
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  test("records the tasks-list capability from an idle poll header", async () => {
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.delight-tools.ai",
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
      baseUrl: "https://atelier.delight-tools.ai",
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

  test("uses the narrow connector bearer token and parses no-content polls", async () => {
    const requests: Request[] = [];
    const client = new CraneConnectorHttpClient({
      baseUrl: "https://atelier.delight-tools.ai",
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
      baseUrl: "https://atelier.delight-tools.ai",
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
      baseUrl: "https://atelier.delight-tools.ai",
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
      baseUrl: "https://atelier.delight-tools.ai",
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
