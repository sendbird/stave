import {
  toTrackerTaskDetailFromCrane,
  toTrackerTaskFromCrane,
} from "../../../src/lib/tracker-tasks/contract";
import type {
  TrackerSourceAdapter,
  TrackerSourceListResult,
} from "../../../src/lib/tracker-tasks/source";
import type {
  TrackerSourceAvailability,
  TrackerTask,
  TrackerTaskDetail,
} from "../../../src/lib/tracker-tasks/types";
import type {
  AtelierConnectorHttpClient,
  CraneTaskJobClaimResponse,
} from "../atelier-connector/http-client";
import { TrackerTaskError } from "./errors";

/**
 * How much of the work list one refresh is allowed to pull.
 *
 * Two independent stops because they fail differently: the row budget bounds
 * memory and the cache write, while the page budget bounds wall-clock time when
 * a server hands back short pages. Whichever trips first ends the sweep, and
 * the surface reports `truncated` so the user knows the list is a prefix rather
 * than everything they have.
 */
const MAX_TASKS_PER_SYNC = 200;
const MAX_PAGES_PER_SYNC = 8;
/**
 * Ask for the host's default page, not the 100-row maximum.
 *
 * A 100-row page with long titles and labels overflows the 256 KB contract
 * budget. Crane then used to 500 the whole collection as `response_too_large`,
 * and Stave showed an empty list. Smaller pages stay inside the budget; the
 * page cap above still reaches the row budget.
 */
const LIST_PAGE_SIZE = 25;

/** Only the three calls this adapter makes, so a test can stub three functions. */
export type CraneTasksHttpClient = Pick<
  AtelierConnectorHttpClient,
  "listCraneTasks" | "getCraneTask" | "createCraneTaskJob"
>;

/**
 * The stored pairing, narrowed to what the adapter reads.
 *
 * Structural rather than the vault's own type so a test can hand over a literal
 * without constructing a credential record, and so the adapter never grows a
 * reason to touch the connector metadata.
 */
export interface CraneTrackerCredential {
  baseUrl: string;
  scopes: readonly string[];
  secret: string;
}

/**
 * Everything the adapter needs from the main process, injected so it can be
 * exercised without an Electron runtime - and so the `stc_` secret is read at
 * the moment of the call instead of being captured at construction.
 *
 * `httpClient` accepts a factory because the base URL lives on the credential:
 * re-pairing to a different Atelier host must not keep talking to the old one.
 */
export interface CraneTrackerSourceDeps {
  getSettings(): { enabled: boolean };
  getCredential(): Promise<CraneTrackerCredential | null>;
  getSecureStorageStatus(): { available: boolean };
  httpClient:
    CraneTasksHttpClient | ((baseUrl: string) => CraneTasksHttpClient);
  /**
   * Last capability the connector poll heard from this host.
   *
   * `false` means the server said the list is off, so we do not hit the
   * collection and then guess from a 404. `null` means no poll has reported
   * yet, so the list call is still the source of truth.
   */
  getTasksEnabled?: () => boolean | null;
}

export interface CraneTrackerSource extends TrackerSourceAdapter {
  /**
   * Open a Crane job for a ticket that is starting now.
   *
   * Lives on the source rather than in the kickoff module so the credential is
   * resolved once, in the one place that already holds it. Not part of
   * `TrackerSourceAdapter`: no other tracker can write a run back.
   */
  createTaskJobForKickoff(args: {
    taskRef: string;
    instruction: string;
    signal?: AbortSignal;
  }): Promise<CraneTaskJobClaimResponse>;
}

function hasCraneScope(credential: CraneTrackerCredential) {
  return credential.scopes.includes("crane");
}

/**
 * A 404 from the *list* route, which cannot mean what a 404 usually means.
 *
 * There is no resource to be missing on a collection endpoint: a paired,
 * in-scope connector that gets 404 here is talking to a Crane deployment whose
 * task API is absent. Reporting that as `not_found` sends the user looking for
 * a ticket, and offers a retry that can never succeed, so it is translated
 * once here. A host that has the route but turned it off answers
 * `tasks_disabled` instead — that code is already the truth and is not
 * rewritten. `getTask` keeps a raw 404, because there it really does mean the
 * ticket is gone.
 */
function isMissingRoute(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === "not_found";
}

function isTasksDisabled(error: unknown): boolean {
  return (
    (error as { code?: unknown } | null | undefined)?.code === "tasks_disabled"
  );
}

function isResponseTooLarge(error: unknown): boolean {
  return (
    (error as { code?: unknown } | null | undefined)?.code ===
    "response_too_large"
  );
}

export function createCraneTrackerSource(
  deps: CraneTrackerSourceDeps,
): CraneTrackerSource {
  function resolveClient(baseUrl: string): CraneTasksHttpClient {
    return typeof deps.httpClient === "function"
      ? deps.httpClient(baseUrl)
      : deps.httpClient;
  }

  /**
   * Resolve the pairing for one call.
   *
   * Throws rather than returning null: every caller here is already past
   * `availability()`, so a missing credential at this point is a real fault and
   * must not be mistaken for an empty work list. The message names no secret.
   */
  async function openSession() {
    const credential = await deps.getCredential();
    if (!credential || !hasCraneScope(credential)) {
      throw new Error("Stave is not paired with Crane for task access.");
    }
    return {
      secret: credential.secret,
      client: resolveClient(credential.baseUrl),
    };
  }

  return {
    sourceId: "crane",
    capabilities: {
      // Crane owns both sides of the trip, so a run started here can be
      // recorded back onto the ticket as an actual job.
      kickoffWriteBack: true,
      detail: true,
    },

    async availability(): Promise<TrackerSourceAvailability> {
      if (!deps.getSettings().enabled) {
        return "disabled";
      }
      // Checked before reading the vault because the vault refuses to decrypt at
      // all without secure storage, which would surface as an error rather than
      // as the setup step it actually is.
      if (!deps.getSecureStorageStatus().available) {
        return "secure_storage_unavailable";
      }
      const credential = await deps.getCredential();
      if (!credential) {
        return "unpaired";
      }
      // A pairing made for Martin alone carries no Crane scope. The task routes
      // would answer 403, so treat it as not paired for this surface instead of
      // polling into a guaranteed rejection.
      return hasCraneScope(credential) ? "ready" : "unpaired";
    },

    async listTasks(args: {
      signal: AbortSignal;
    }): Promise<TrackerSourceListResult> {
      if (deps.getTasksEnabled?.() === false) {
        throw new TrackerTaskError("tasks_disabled");
      }
      const { secret, client } = await openSession();
      const tasks: TrackerTask[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;

      let pageLimit = LIST_PAGE_SIZE;
      for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
        let response;
        try {
          response = await client.listCraneTasks({
            secret,
            limit: pageLimit,
            cursor,
            signal: args.signal,
          });
        } catch (error) {
          if (isTasksDisabled(error)) {
            throw new TrackerTaskError("tasks_disabled");
          }
          if (isMissingRoute(error)) {
            throw new TrackerTaskError("tasks_api_unavailable");
          }
          if (isResponseTooLarge(error) && pageLimit > 1) {
            pageLimit = Math.max(1, Math.floor(pageLimit / 2));
            page -= 1;
            continue;
          }
          throw error;
        }
        for (const row of response.tasks) {
          if (tasks.length >= MAX_TASKS_PER_SYNC) break;
          tasks.push(toTrackerTaskFromCrane(row));
        }
        const nextCursor = response.nextCursor;
        if (!nextCursor) {
          return { tasks, truncated: false };
        }
        if (tasks.length >= MAX_TASKS_PER_SYNC) {
          return { tasks, truncated: true };
        }
        // A server that keeps handing back the cursor it was just given would
        // spin here until the page budget ran out and then re-fetch the same
        // rows on every refresh. Stop at the repeat and report the list as a
        // prefix: a stuck pager is a truncated read, not an error the user can
        // do anything about.
        if (seenCursors.has(nextCursor)) {
          return { tasks, truncated: true };
        }
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      }

      // Fell out of the page budget with a cursor still outstanding.
      return { tasks, truncated: true };
    },

    async getTask(args: {
      ref: string;
      signal: AbortSignal;
    }): Promise<TrackerTaskDetail> {
      const { secret, client } = await openSession();
      const response = await client.getCraneTask({
        secret,
        taskRef: args.ref,
        signal: args.signal,
      });
      return toTrackerTaskDetailFromCrane(response.task);
    },

    async createTaskJobForKickoff(args: {
      taskRef: string;
      instruction: string;
      signal?: AbortSignal;
    }): Promise<CraneTaskJobClaimResponse> {
      const { secret, client } = await openSession();
      return client.createCraneTaskJob({
        secret,
        taskRef: args.taskRef,
        instruction: args.instruction,
        signal: args.signal,
      });
    },
  };
}

/**
 * Default wiring against the main-process singletons. Kept in a factory with
 * lazy imports so merely importing this module does not pull Electron, the
 * connector runtime, or the persistence layer into a test process.
 */
export async function createDefaultCraneTrackerSource(): Promise<CraneTrackerSource> {
  const [{ app }, connector, vaultService, { AtelierConnectorHttpClient }] =
    await Promise.all([
      import("electron"),
      import("../crane-connector/service"),
      import("../atelier-connector/credential-service"),
      import("../atelier-connector/http-client"),
    ]);
  const vault = vaultService.getAtelierConnectorCredentialVault();
  const allowInsecureLocalhost =
    process.env.STAVE_DEV === "1" && !app.isPackaged;

  return createCraneTrackerSource({
    // The connector's enabled flag is pushed from the renderer into the runtime
    // and never persisted separately in the main process, so the runtime state
    // is the only main-process source of truth for it.
    getSettings: () => ({
      enabled: connector.getCraneConnectorStatus().runtimeState !== "disabled",
    }),
    getCredential: () => vault.getCredential(),
    getSecureStorageStatus: () => ({
      available: vault.isSecureStorageAvailable(),
    }),
    getTasksEnabled: () => connector.getCraneTasksEnabled(),
    httpClient: (baseUrl) =>
      new AtelierConnectorHttpClient({ baseUrl, allowInsecureLocalhost }),
  });
}
