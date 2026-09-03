import { describe, expect, test } from "bun:test";

import {
  AtelierConnectorHttpClient,
  AtelierConnectorHttpError,
} from "../electron/main/atelier-connector/http-client";
import {
  createCraneTrackerSource,
  type CraneTasksHttpClient,
  type CraneTrackerCredential,
  type CraneTrackerSourceDeps,
} from "../electron/main/tracker-tasks/crane-source";
import { CRANE_TASKS_LIMITS } from "../src/lib/tracker-tasks/contract";

const BASE_URL = "https://atelier.example.test";
const SECRET = "stc_test-only-secret";

const fixtureDirectory = new URL("./fixtures/crane-tasks-v1/", import.meta.url);

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

/**
 * A client whose fetch records every request and answers from a queue, so a
 * paging test can assert both the responses consumed and the URLs produced.
 */
function stubClient(responses: (() => Response)[]) {
  const requests: Request[] = [];
  const client = new AtelierConnectorHttpClient({
    baseUrl: BASE_URL,
    fetch: (async (input, init) => {
      requests.push(new Request(input, init));
      const next =
        responses[Math.min(requests.length - 1, responses.length - 1)];
      return next!();
    }) as typeof fetch,
  });
  return { client, requests };
}

async function listFixtureRow() {
  return (await readFixture("task-list.json")).tasks[0];
}

function craneRow(template: Record<string, unknown>, index: number) {
  return {
    ...template,
    id: `task_page_${index}`,
    number: index + 1,
    key: `CRN-${1_000 + index}`,
    href: `https://atelier.example.com/crane/issues/CRN-${1_000 + index}`,
  };
}

describe("AtelierConnectorHttpClient Crane task routes", () => {
  test("reads a task list, a task detail, and a claimed job", async () => {
    const list = await readFixture("task-list.json");
    const detail = await readFixture("task-detail.json");
    const claim = await readFixture("task-job-claim.json");
    const { client, requests } = stubClient([
      () => jsonResponse(list),
      () => jsonResponse(detail),
      () => jsonResponse(claim),
    ]);

    const listed = await client.listCraneTasks({ secret: SECRET });
    expect(listed.tasks).toHaveLength(4);
    expect(listed.nextCursor).toBe("crn_cursor_page_2");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/crane/stave/tasks");
    expect(requests[0]!.headers.get("Authorization")).toBe(`Bearer ${SECRET}`);

    const read = await client.getCraneTask({
      secret: SECRET,
      taskRef: "CRN-101",
    });
    expect(read.task.key).toBe("CRN-101");
    expect(new URL(requests[1]!.url).pathname).toBe(
      "/api/crane/stave/tasks/CRN-101",
    );

    const claimed = await client.createCraneTaskJob({
      secret: SECRET,
      taskRef: "CRN-101",
      instruction: "Restore each pane independently.",
    });
    expect(claimed.leaseId).toBe(claim.leaseId);
    expect(claimed.job.issue.key).toBe("CRN-101");
    expect(requests[2]!.method).toBe("POST");
    expect(new URL(requests[2]!.url).pathname).toBe(
      "/api/crane/stave/tasks/CRN-101/stave-jobs/claim",
    );
    expect(await requests[2]!.json()).toEqual({
      protocolVersion: 1,
      instruction: "Restore each pane independently.",
    });
  });

  test("builds the list query with a repeated status filter", async () => {
    const list = await readFixture("task-list.json");
    const { client, requests } = stubClient([() => jsonResponse(list)]);
    await client.listCraneTasks({
      secret: SECRET,
      status: ["todo", "in_progress"],
      updatedAfter: "2026-02-01T00:00:00+00:00",
      limit: 50,
      cursor: "crn_cursor_page_2",
    });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.getAll("status")).toEqual(["todo", "in_progress"]);
    expect(url.searchParams.get("updatedAfter")).toBe(
      "2026-02-01T00:00:00+00:00",
    );
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("cursor")).toBe("crn_cursor_page_2");
    // The secret travels in the Authorization header only; a URL can end up in
    // a log or a crash report.
    expect(requests[0]!.url).not.toContain(SECRET);
  });

  test("escapes a task ref instead of letting it reshape the path", async () => {
    const detail = await readFixture("task-detail.json");
    const { client, requests } = stubClient([() => jsonResponse(detail)]);
    await client.getCraneTask({
      secret: SECRET,
      taskRef: "../connectors/exchange",
    });
    expect(new URL(requests[0]!.url).pathname).toBe(
      "/api/crane/stave/tasks/..%2Fconnectors%2Fexchange",
    );
  });

  test("rejects a list response larger than the list budget", async () => {
    const oversize = "x".repeat(CRANE_TASKS_LIMITS.listBytes + 1_024);
    const { client } = stubClient([
      () =>
        new Response(
          JSON.stringify({ contract: "crane-tasks-v1", pad: oversize }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    ]);
    await expect(
      client.listCraneTasks({ secret: SECRET }),
    ).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  test("maps the conflict and permission answers the task routes return", async () => {
    const conflict = stubClient([
      () => jsonResponse({ error: "job_active" }, { status: 409 }),
    ]);
    await expect(
      conflict.client.createCraneTaskJob({
        secret: SECRET,
        taskRef: "CRN-101",
        instruction: "Start the run.",
      }),
    ).rejects.toMatchObject({ code: "job_active", status: 409 });

    const closed = stubClient([
      () => jsonResponse({ error: "task_closed" }, { status: 409 }),
    ]);
    await expect(
      closed.client.createCraneTaskJob({
        secret: SECRET,
        taskRef: "CRN-104",
        instruction: "Start the run.",
      }),
    ).rejects.toMatchObject({ code: "task_closed", status: 409 });

    const forbidden = stubClient([
      () => jsonResponse({ error: "forbidden" }, { status: 403 }),
    ]);
    await expect(
      forbidden.client.listCraneTasks({ secret: SECRET }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    // A bodyless failure still has to name the outcome the caller acts on.
    const missing = stubClient([() => new Response(null, { status: 404 })]);
    await expect(
      missing.client.getCraneTask({ secret: SECRET, taskRef: "CRN-999" }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  test("never carries the secret into a thrown error", async () => {
    const remote = stubClient([
      () => jsonResponse({ error: "forbidden" }, { status: 403 }),
    ]);
    const thrown = await remote.client
      .listCraneTasks({ secret: SECRET })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AtelierConnectorHttpError);
    const serialized = [
      String(thrown),
      JSON.stringify(thrown),
      (thrown as Error).stack ?? "",
      (thrown as Error).message,
    ].join("\n");
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("stc_");

    // A transport failure often quotes the whole request; the client must
    // replace it rather than re-throw it.
    const leaky = new AtelierConnectorHttpClient({
      baseUrl: BASE_URL,
      fetch: (async () => {
        throw new Error(`connect failed for Bearer ${SECRET}`);
      }) as typeof fetch,
    });
    const networkError = await leaky
      .listCraneTasks({ secret: SECRET })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(networkError).toMatchObject({
      code: "network_unavailable",
      status: 0,
    });
    expect(
      `${String(networkError)}${JSON.stringify(networkError)}`,
    ).not.toContain("stc_");
  });
});

describe("Crane tracker source", () => {
  function makeDeps(overrides?: {
    enabled?: boolean;
    secureStorage?: boolean;
    credential?: CraneTrackerCredential | null;
    httpClient?: CraneTasksHttpClient;
  }): CraneTrackerSourceDeps {
    const credential =
      overrides?.credential === undefined
        ? { baseUrl: BASE_URL, scopes: ["crane"], secret: SECRET }
        : overrides.credential;
    return {
      getSettings: () => ({ enabled: overrides?.enabled ?? true }),
      getCredential: async () => credential,
      getSecureStorageStatus: () => ({
        available: overrides?.secureStorage ?? true,
      }),
      httpClient:
        overrides?.httpClient ??
        ({
          listCraneTasks: async () => {
            throw new Error("unexpected list call");
          },
          getCraneTask: async () => {
            throw new Error("unexpected detail call");
          },
          createCraneTaskJob: async () => {
            throw new Error("unexpected claim call");
          },
        } as unknown as CraneTasksHttpClient),
    };
  }

  function pagingClient(
    pages: (args: { cursor?: string }) => {
      rows: number;
      nextCursor: string | null;
    },
  ) {
    const cursors: (string | undefined)[] = [];
    let template: Record<string, unknown> | null = null;
    const client = {
      listCraneTasks: async (args: { cursor?: string }) => {
        cursors.push(args.cursor);
        template ??= await listFixtureRow();
        const page = pages(args);
        return {
          contract: "crane-tasks-v1" as const,
          tasks: Array.from({ length: page.rows }, (_, index) =>
            craneRow(template!, cursors.length * 1_000 + index),
          ),
          nextCursor: page.nextCursor,
          generatedAt: "2026-02-25T12:00:00+00:00",
        };
      },
    } as unknown as CraneTasksHttpClient;
    return { client, cursors };
  }

  test("reports each availability branch", async () => {
    const signalDeps = (deps: CraneTrackerSourceDeps) =>
      createCraneTrackerSource(deps).availability();

    expect(await signalDeps(makeDeps({ enabled: false }))).toBe("disabled");
    expect(await signalDeps(makeDeps({ secureStorage: false }))).toBe(
      "secure_storage_unavailable",
    );
    expect(await signalDeps(makeDeps({ credential: null }))).toBe("unpaired");
    expect(
      await signalDeps(
        makeDeps({
          credential: { baseUrl: BASE_URL, scopes: ["martin"], secret: SECRET },
        }),
      ),
    ).toBe("unpaired");
    expect(await signalDeps(makeDeps())).toBe("ready");
    expect(createCraneTrackerSource(makeDeps()).capabilities).toEqual({
      kickoffWriteBack: true,
      detail: true,
    });
  });

  test("follows the cursor and marks the list truncated at the row budget", async () => {
    const paging = pagingClient(() => ({
      rows: CRANE_TASKS_LIMITS.pageSize,
      nextCursor: `crn_${Math.random()}`,
    }));
    const source = createCraneTrackerSource(
      makeDeps({ httpClient: paging.client }),
    );
    const result = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(result.tasks).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(paging.cursors).toHaveLength(2);
    expect(paging.cursors[0]).toBeUndefined();
    expect(paging.cursors[1]).toBeString();
  });

  test("stops at the page budget when the pages are short", async () => {
    let page = 0;
    const paging = pagingClient(() => {
      page += 1;
      return { rows: 2, nextCursor: `crn_cursor_${page}` };
    });
    const source = createCraneTrackerSource(
      makeDeps({ httpClient: paging.client }),
    );
    const result = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(paging.cursors).toHaveLength(4);
    expect(result.tasks).toHaveLength(8);
    expect(result.truncated).toBe(true);
  });

  test("treats a repeated cursor as the end of the list rather than a hang", async () => {
    const paging = pagingClient(() => ({ rows: 1, nextCursor: "crn_stuck" }));
    const source = createCraneTrackerSource(
      makeDeps({ httpClient: paging.client }),
    );
    const result = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(paging.cursors).toEqual([undefined, "crn_stuck"]);
    expect(result.tasks).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  test("reports the whole list when the cursor runs out", async () => {
    const paging = pagingClient(() => ({ rows: 3, nextCursor: null }));
    const source = createCraneTrackerSource(
      makeDeps({ httpClient: paging.client }),
    );
    const result = await source.listTasks({
      signal: new AbortController().signal,
    });
    expect(paging.cursors).toHaveLength(1);
    expect(result.tasks).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  test("reads a detail and claims a kickoff job with the stored credential", async () => {
    const detail = await readFixture("task-detail.json");
    const claim = await readFixture("task-job-claim.json");
    const seen: Record<string, unknown>[] = [];
    const client = {
      getCraneTask: async (args: Record<string, unknown>) => {
        seen.push(args);
        return detail;
      },
      createCraneTaskJob: async (args: Record<string, unknown>) => {
        seen.push(args);
        return claim;
      },
    } as unknown as CraneTasksHttpClient;

    const source = createCraneTrackerSource(makeDeps({ httpClient: client }));
    const read = await source.getTask({
      ref: "CRN-101",
      signal: new AbortController().signal,
    });
    expect(read.key).toBe("CRN-101");
    expect(read.description).toContain("## Expected");

    const claimed = await source.createTaskJobForKickoff({
      taskRef: "CRN-101",
      instruction: "Restore each pane independently.",
    });
    expect(claimed.leaseId).toBe(claim.leaseId);
    expect(seen.every((args) => args.secret === SECRET)).toBe(true);
  });

  test("refuses a call when the pairing lost the Crane scope", async () => {
    const source = createCraneTrackerSource(
      makeDeps({
        credential: { baseUrl: BASE_URL, scopes: ["martin"], secret: SECRET },
      }),
    );
    const thrown = await source
      .listTasks({ signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((thrown as Error).message).not.toContain("stc_");
    expect((thrown as Error).message).toContain("not paired");
  });

  test("resolves the client from the credential base URL", async () => {
    const seenBaseUrls: string[] = [];
    const deps = makeDeps();
    const source = createCraneTrackerSource({
      ...deps,
      httpClient: (baseUrl) => {
        seenBaseUrls.push(baseUrl);
        return {
          listCraneTasks: async () => ({
            contract: "crane-tasks-v1" as const,
            tasks: [],
            nextCursor: null,
            generatedAt: "2026-02-25T12:00:00+00:00",
          }),
        } as unknown as CraneTasksHttpClient;
      },
    });
    await source.listTasks({ signal: new AbortController().signal });
    expect(seenBaseUrls).toEqual([BASE_URL]);
  });

  test("reads a 404 on the list as a missing task API, not a missing ticket", () => {
    // A collection endpoint has no resource to be absent, so this can only mean
    // the Crane deployment does not serve the route. Surfacing `not_found` would
    // send the user hunting for a ticket that was never named.
    const source = createCraneTrackerSource(
      makeDeps({
        httpClient: {
          listCraneTasks: async () => {
            throw new AtelierConnectorHttpError("not_found", 404);
          },
        } as unknown as CraneTasksHttpClient,
      }),
    );
    return source
      .listTasks({ signal: new AbortController().signal })
      .then(() => {
        throw new Error("expected the list to reject");
      })
      .catch((error: unknown) => {
        expect((error as { code?: string }).code).toBe("tasks_api_unavailable");
      });
  });

  test("leaves a 404 on one ticket alone, because there it is the truth", async () => {
    const source = createCraneTrackerSource(
      makeDeps({
        httpClient: {
          getCraneTask: async () => {
            throw new AtelierConnectorHttpError("not_found", 404);
          },
        } as unknown as CraneTasksHttpClient,
      }),
    );
    const thrown = await source
      .getTask({ ref: "CRN-1", signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((thrown as { code?: string }).code).toBe("not_found");
  });

  test("still reports a genuine transport failure as itself", async () => {
    const source = createCraneTrackerSource(
      makeDeps({
        httpClient: {
          listCraneTasks: async () => {
            throw new AtelierConnectorHttpError("network_unavailable", 0);
          },
        } as unknown as CraneTasksHttpClient,
      }),
    );
    const thrown = await source
      .listTasks({ signal: new AbortController().signal })
      .then(() => null)
      .catch((error: unknown) => error);
    expect((thrown as { code?: string }).code).toBe("network_unavailable");
  });
});
