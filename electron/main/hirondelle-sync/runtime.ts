import { z } from "zod";

import type { AtelierConnectorScope } from "../../../src/lib/atelier-connector/types";
import {
  STAVE_SYNC_LIMITS,
  StaveSyncEventV1Schema,
  StaveSyncLinkV1Schema,
  type StaveSyncEventV1,
  type StaveSyncLinkV1,
} from "../../../src/lib/hirondelle-sync/contract";
import {
  DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  HirondelleSyncSettingsSchema,
  type HirondelleSyncMappingStalePayload,
  type HirondelleSyncPublicStatus,
  type HirondelleSyncSettings,
} from "../../../src/lib/hirondelle-sync/types";
import type { HirondelleOutboxEntry } from "../../persistence/hirondelle-sync-outbox-store";
import type { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import { AtelierConnectorHttpError } from "../atelier-connector/http-client";
import { computeCraneConnectorRetryDelay } from "../crane-connector/runtime";

export const MAX_HIRONDELLE_SYNC_ATTEMPTS = 8;
export const HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS = 30_000;

const HIRONDELLE_SYNC_RETRY_BASE_MS = 5_000;
const HIRONDELLE_SYNC_IDLE_POLL_MS = 5_000;
const HIRONDELLE_SYNC_DRAIN_LIMIT = 50;

const LinksMergePayloadSchema = z
  .object({
    links: z
      .array(StaveSyncLinkV1Schema)
      .max(STAVE_SYNC_LIMITS.linksPerMerge),
  })
  .strict();

export type { HirondelleSyncPublicStatus };

export interface HirondelleSyncOutboxPersistence {
  enqueueHirondelleOutboxEntry(input: {
    workspaceId: string;
    projectRef: string;
    kind: "event";
    payloadJson: string;
    now: string;
  }): HirondelleOutboxEntry;
  upsertHirondelleLinksMergeEntry(input: {
    workspaceId: string;
    projectRef: string;
    payloadJson: string;
    nextAttemptAt: string;
    now: string;
  }): HirondelleOutboxEntry;
  listDueHirondelleOutboxEntries(args: {
    now: string;
    limit: number;
  }): HirondelleOutboxEntry[];
  markHirondelleOutboxDelivered(id: string, deliveredAt: string): void;
  markHirondelleOutboxRetry(
    id: string,
    attempts: number,
    nextAttemptAt: string,
  ): void;
  markHirondelleOutboxFailed(id: string): void;
  setHirondelleOutboxWorkspaceHeld(
    workspaceId: string,
    held: boolean,
  ): number;
  retryFailedHirondelleOutboxEntries(): number;
  countHirondelleOutbox(): { pending: number; failed: number };
}

interface HirondelleSyncCredential {
  baseUrl: string;
  secret: string;
  scopes: AtelierConnectorScope[];
}

interface HirondelleSyncRuntimeDependencies {
  persistence: HirondelleSyncOutboxPersistence;
  getCredential: () => Promise<HirondelleSyncCredential | null>;
  createHttpClient: (baseUrl: string) => AtelierConnectorHttpClient;
  emitStatus: (status: HirondelleSyncPublicStatus) => void;
  emitMappingStale: (args: HirondelleSyncMappingStalePayload) => void;
  now?: () => Date;
  random?: () => number;
  setTimer?: (
    callback: () => void,
    delayMs: number,
  ) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

interface EventBatch {
  workspaceId: string;
  projectRef: string;
  rows: HirondelleOutboxEntry[];
}

interface DrainFailure {
  runtimeState: "offline" | "error";
  code: string;
}

function errorCode(error: unknown) {
  if (error instanceof AtelierConnectorHttpError) return error.code;
  if (
    error instanceof Error &&
    /^[a-z][a-z0-9_]*$/.test(error.message)
  ) {
    return error.message;
  }
  return "sync_error";
}

function splitIntoBatches<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

export class HirondelleSyncRuntime {
  private settings: HirondelleSyncSettings = {
    ...DEFAULT_HIRONDELLE_SYNC_SETTINGS,
  };
  private status: HirondelleSyncPublicStatus;
  private timer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  private generation = 0;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: HirondelleSyncRuntimeDependencies,
  ) {
    const counts = dependencies.persistence.countHirondelleOutbox();
    this.status = {
      runtimeState: "disabled",
      lastErrorCode: null,
      pendingCount: counts.pending,
      failedCount: counts.failed,
      lastDeliveredAt: null,
    };
  }

  configure(settings: HirondelleSyncSettings): HirondelleSyncPublicStatus {
    this.stopPendingWork();
    this.settings = HirondelleSyncSettingsSchema.parse(settings);
    if (!this.settings.enabled) {
      this.setStatus({
        runtimeState: "disabled",
        lastErrorCode: null,
        ...this.getCountsPatch(),
      });
      return this.getStatus();
    }

    this.setStatus({
      runtimeState: "idle",
      lastErrorCode: null,
      ...this.getCountsPatch(),
    });
    this.schedule(0);
    return this.getStatus();
  }

  getStatus(): HirondelleSyncPublicStatus {
    return { ...this.status };
  }

  getSettings(): HirondelleSyncSettings {
    return { ...this.settings };
  }

  enqueueEvent(args: {
    workspaceId: string;
    projectRef: string;
    event: StaveSyncEventV1;
  }): void {
    const event = StaveSyncEventV1Schema.parse(args.event);
    const now = this.nowIso();
    this.dependencies.persistence.enqueueHirondelleOutboxEntry({
      workspaceId: args.workspaceId,
      projectRef: args.projectRef,
      kind: "event",
      payloadJson: JSON.stringify(event),
      now,
    });
    this.setStatus(this.getCountsPatch());
    this.schedule(0);
  }

  noteLinksChanged(args: {
    workspaceId: string;
    projectRef: string;
    links: StaveSyncLinkV1[];
  }): void {
    const links = args.links.map((link) =>
      StaveSyncLinkV1Schema.parse(link),
    );
    if (links.length > STAVE_SYNC_LIMITS.linksPerMerge) {
      throw new Error("too_many_hirondelle_links");
    }
    const now = this.now();
    this.dependencies.persistence.upsertHirondelleLinksMergeEntry({
      workspaceId: args.workspaceId,
      projectRef: args.projectRef,
      payloadJson: JSON.stringify({ links }),
      nextAttemptAt: new Date(
        now.getTime() + HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS,
      ).toISOString(),
      now: now.toISOString(),
    });
    this.setStatus(this.getCountsPatch());
    this.schedule(HIRONDELLE_LINKS_MERGE_DEBOUNCE_MS);
  }

  retryFailed(): void {
    this.dependencies.persistence.retryFailedHirondelleOutboxEntries();
    this.setStatus({
      lastErrorCode: null,
      ...this.getCountsPatch(),
    });
    this.schedule(0);
  }

  holdWorkspace(workspaceId: string): void {
    this.dependencies.persistence.setHirondelleOutboxWorkspaceHeld(
      workspaceId,
      true,
    );
    this.setStatus(this.getCountsPatch());
  }

  resumeWorkspace(workspaceId: string): void {
    this.dependencies.persistence.setHirondelleOutboxWorkspaceHeld(
      workspaceId,
      false,
    );
    this.setStatus(this.getCountsPatch());
    this.schedule(0);
  }

  shutdown(): void {
    this.stopPendingWork();
  }

  private async drain() {
    const generation = this.generation;
    if (!this.settings.enabled) {
      this.setStatus({
        runtimeState: "disabled",
        lastErrorCode: null,
        ...this.getCountsPatch(),
      });
      return;
    }

    let credential: HirondelleSyncCredential | null;
    try {
      credential = await this.dependencies.getCredential();
    } catch (error) {
      if (generation !== this.generation) return;
      this.setStatus({
        runtimeState: "error",
        lastErrorCode: errorCode(error),
        ...this.getCountsPatch(),
      });
      return;
    }
    if (generation !== this.generation) return;
    if (!credential || !credential.scopes.includes("hirondelle")) {
      this.setStatus({
        runtimeState: "unpaired",
        lastErrorCode: null,
        ...this.getCountsPatch(),
      });
      return;
    }

    const now = this.now();
    const due =
      this.dependencies.persistence.listDueHirondelleOutboxEntries({
        now: now.toISOString(),
        limit: HIRONDELLE_SYNC_DRAIN_LIMIT,
      });
    if (due.length === 0) {
      const counts = this.dependencies.persistence.countHirondelleOutbox();
      this.setStatus({
        runtimeState: "idle",
        lastErrorCode: null,
        pendingCount: counts.pending,
        failedCount: counts.failed,
      });
      if (counts.pending > 0) {
        this.schedule(HIRONDELLE_SYNC_IDLE_POLL_MS);
      }
      return;
    }

    this.setStatus({
      runtimeState: "syncing",
      lastErrorCode: null,
      ...this.getCountsPatch(),
    });
    const controller = this.createAbortController();
    const client = this.dependencies.createHttpClient(credential.baseUrl);
    const eventBatches = this.buildEventBatches(due);
    const linksRows = due.filter((entry) => entry.kind === "links_merge");
    const heldWorkspaces = new Set<string>();
    let failure: DrainFailure | null = null;
    let minimumRetryDelay: number | null = null;
    let lastDeliveredAt = this.status.lastDeliveredAt;

    for (const batch of eventBatches) {
      if (heldWorkspaces.has(batch.workspaceId)) continue;
      try {
        const events = batch.rows.map((row) =>
          StaveSyncEventV1Schema.parse(JSON.parse(row.payloadJson)),
        );
        await client.postHirondelleEvents({
          secret: credential.secret,
          projectRef: batch.projectRef,
          events,
          signal: controller.signal,
        });
        if (generation !== this.generation) return;
        const deliveredAt = this.nowIso();
        for (const row of batch.rows) {
          this.dependencies.persistence.markHirondelleOutboxDelivered(
            row.id,
            deliveredAt,
          );
        }
        lastDeliveredAt = deliveredAt;
      } catch (error) {
        if (generation !== this.generation) return;
        const result = this.handleDeliveryError(error, batch.rows);
        if (result.stop) return;
        if (result.mappingStale) {
          heldWorkspaces.add(batch.workspaceId);
        }
        failure = result.failure ?? failure;
        if (result.retryDelay !== null) {
          minimumRetryDelay =
            minimumRetryDelay === null
              ? result.retryDelay
              : Math.min(minimumRetryDelay, result.retryDelay);
        }
      }
    }

    for (const row of linksRows) {
      if (heldWorkspaces.has(row.workspaceId)) continue;
      try {
        const payload = LinksMergePayloadSchema.parse(
          JSON.parse(row.payloadJson),
        );
        if (payload.links.length > 0) {
          await client.mergeHirondelleLinks({
            secret: credential.secret,
            projectRef: row.projectRef,
            links: payload.links,
            signal: controller.signal,
          });
        }
        if (generation !== this.generation) return;
        const deliveredAt = this.nowIso();
        this.dependencies.persistence.markHirondelleOutboxDelivered(
          row.id,
          deliveredAt,
        );
        lastDeliveredAt = deliveredAt;
      } catch (error) {
        if (generation !== this.generation) return;
        const result = this.handleDeliveryError(error, [row]);
        if (result.stop) return;
        failure = result.failure ?? failure;
        if (result.retryDelay !== null) {
          minimumRetryDelay =
            minimumRetryDelay === null
              ? result.retryDelay
              : Math.min(minimumRetryDelay, result.retryDelay);
        }
      }
    }

    if (this.abortController === controller) {
      this.abortController = null;
    }
    const counts = this.dependencies.persistence.countHirondelleOutbox();
    this.setStatus({
      runtimeState: failure?.runtimeState ?? "idle",
      lastErrorCode: failure?.code ?? null,
      pendingCount: counts.pending,
      failedCount: counts.failed,
      lastDeliveredAt,
    });

    if (minimumRetryDelay !== null) {
      this.schedule(minimumRetryDelay);
      return;
    }
    if (counts.pending > 0) {
      const moreDue =
        this.dependencies.persistence.listDueHirondelleOutboxEntries({
          now: this.nowIso(),
          limit: 1,
        }).length > 0;
      this.schedule(moreDue ? 0 : HIRONDELLE_SYNC_IDLE_POLL_MS);
    }
  }

  private buildEventBatches(
    entries: HirondelleOutboxEntry[],
  ): EventBatch[] {
    const groups = new Map<
      string,
      {
        workspaceId: string;
        projectRef: string;
        rows: HirondelleOutboxEntry[];
      }
    >();
    for (const entry of entries) {
      switch (entry.kind) {
        case "event": {
          const key = `${entry.workspaceId}\u0000${entry.projectRef}`;
          const group = groups.get(key) ?? {
            workspaceId: entry.workspaceId,
            projectRef: entry.projectRef,
            rows: [],
          };
          group.rows.push(entry);
          groups.set(key, group);
          break;
        }
        case "links_merge":
          break;
        default:
          entry.kind satisfies never;
      }
    }

    const batches: EventBatch[] = [];
    for (const group of groups.values()) {
      for (const values of splitIntoBatches(
        group.rows,
        STAVE_SYNC_LIMITS.batch,
      )) {
        batches.push({
          workspaceId: group.workspaceId,
          projectRef: group.projectRef,
          rows: values,
        });
      }
    }
    return batches;
  }

  private handleDeliveryError(
    error: unknown,
    rows: HirondelleOutboxEntry[],
  ): {
    stop: boolean;
    mappingStale: boolean;
    failure: DrainFailure | null;
    retryDelay: number | null;
  } {
    if (
      error instanceof AtelierConnectorHttpError &&
      (error.status === 401 || error.status === 403)
    ) {
      this.setStatus({
        runtimeState: "unauthorized",
        lastErrorCode: error.code,
        ...this.getCountsPatch(),
      });
      return {
        stop: true,
        mappingStale: false,
        failure: null,
        retryDelay: null,
      };
    }

    if (
      error instanceof AtelierConnectorHttpError &&
      (error.status === 404 || error.status === 409)
    ) {
      const code =
        error.status === 404 ? "project_not_found" : "project_archived";
      const workspaces = new Map(
        rows.map((row) => [
          row.workspaceId,
          { workspaceId: row.workspaceId, projectRef: row.projectRef },
        ]),
      );
      for (const { workspaceId, projectRef } of workspaces.values()) {
        this.dependencies.persistence.setHirondelleOutboxWorkspaceHeld(
          workspaceId,
          true,
        );
        this.dependencies.emitMappingStale({
          workspaceId,
          projectRef,
          code,
        });
      }
      return {
        stop: false,
        mappingStale: true,
        failure: { runtimeState: "error", code },
        retryDelay: null,
      };
    }

    const code = errorCode(error);
    let minimumRetryDelay: number | null = null;
    for (const row of rows) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_HIRONDELLE_SYNC_ATTEMPTS) {
        this.dependencies.persistence.markHirondelleOutboxFailed(row.id);
        continue;
      }
      const delay = computeCraneConnectorRetryDelay({
        baseDelayMs: HIRONDELLE_SYNC_RETRY_BASE_MS,
        failureCount: attempts,
        random: this.dependencies.random,
      });
      this.dependencies.persistence.markHirondelleOutboxRetry(
        row.id,
        attempts,
        new Date(this.now().getTime() + delay).toISOString(),
      );
      minimumRetryDelay =
        minimumRetryDelay === null
          ? delay
          : Math.min(minimumRetryDelay, delay);
    }
    return {
      stop: false,
      mappingStale: false,
      failure: {
        runtimeState: code === "network_unavailable" ? "offline" : "error",
        code,
      },
      retryDelay: minimumRetryDelay,
    };
  }

  private setStatus(patch: Partial<HirondelleSyncPublicStatus>) {
    this.status = { ...this.status, ...patch };
    this.dependencies.emitStatus(this.getStatus());
  }

  private getCountsPatch() {
    const counts = this.dependencies.persistence.countHirondelleOutbox();
    return {
      pendingCount: counts.pending,
      failedCount: counts.failed,
    };
  }

  private createAbortController() {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    return controller;
  }

  private stopPendingWork() {
    this.generation += 1;
    if (this.timer) {
      (this.dependencies.clearTimer ?? clearTimeout)(this.timer);
      this.timer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }

  private schedule(delayMs: number) {
    if (!this.settings.enabled) return;
    if (this.timer) {
      (this.dependencies.clearTimer ?? clearTimeout)(this.timer);
    }
    const generation = this.generation;
    this.timer = (this.dependencies.setTimer ?? setTimeout)(() => {
      this.timer = null;
      if (generation !== this.generation || !this.settings.enabled) {
        return;
      }
      void this.enqueue(() => this.drain());
    }, Math.max(0, delayMs));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private now() {
    return (this.dependencies.now ?? (() => new Date()))();
  }

  private nowIso() {
    return this.now().toISOString();
  }
}
