import path from "node:path";
import { z } from "zod";
import type {
  AccountUsageBucket,
  KiroUsageSnapshot,
} from "../../../src/lib/providers/provider.types";
import { AcpProtocolClient } from "../acp/acp-protocol";
import { buildKiroCliEnv, resolveKiroExecutablePath } from "../kiro-cli-env";
import type { StreamTurnArgs } from "../types";
import {
  USAGE_CLIENT_NAME,
  USAGE_CLIENT_VERSION,
} from "./usage-client-identity";

const KiroUsageResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        planName: z.string().nullish(),
        billingCycleReset: z.string().nullish(),
        overagesEnabled: z.boolean().nullish(),
        usageBreakdowns: z.array(
          z
            .object({
              resourceType: z.string().trim().min(1),
              displayName: z.string().trim().min(1),
              used: z.number().nonnegative(),
              limit: z.number().nonnegative().nullish(),
              percentage: z.number().nonnegative().nullish(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

type KiroUsageConnection = {
  executablePath: string;
  client: AcpProtocolClient;
  sessionId: string;
};

/**
 * How long an idle usage connection is kept before it is closed.
 *
 * Reading Kiro usage needs an ACP session, and keeping one open for the whole
 * life of the app means a permanently open agent session that exists only to
 * answer a status-bar meter — a long-lived session with no user behind it.
 * The connection is instead kept just long enough for a burst (a forced read
 * right after a background one) to reuse it, then closed.
 */
export const KIRO_USAGE_SESSION_IDLE_MS = 90_000;

let activeConnection: KiroUsageConnection | null = null;
let connecting: Promise<KiroUsageConnection> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function armIdleClose() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    resetActiveConnection();
  }, KIRO_USAGE_SESSION_IDLE_MS);
  // Never hold the process open just to run this teardown.
  idleTimer.unref?.();
}

function resetActiveConnection() {
  clearIdleTimer();
  activeConnection?.client.close();
  activeConnection = null;
}

export async function closeKiroUsageConnection() {
  const pending = connecting;
  connecting = null;
  if (pending) {
    try {
      (await pending).client.close();
    } catch {
      // A failed connection already closes its own process.
    }
  }
  resetActiveConnection();
}

function unavailable(error: string): KiroUsageSnapshot {
  return {
    source: "unavailable",
    planName: null,
    monthly: null,
    buckets: [],
    overagesEnabled: null,
    error,
  };
}

function resetEpochSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.round(parsed / 1_000);
}

export function mapKiroUsageResponse(raw: unknown): KiroUsageSnapshot | null {
  const parsed = KiroUsageResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.success) {
    return null;
  }
  const data = parsed.data.data;
  const resetsAt = resetEpochSeconds(data.billingCycleReset);
  const buckets: AccountUsageBucket[] = data.usageBreakdowns.map(
    (breakdown) => {
      const ratio =
        breakdown.limit && breakdown.limit > 0
          ? (breakdown.used / breakdown.limit) * 100
          : null;
      return {
        id: breakdown.resourceType,
        label: breakdown.displayName,
        usedPercent: Math.min(
          100,
          Math.max(0, breakdown.percentage ?? ratio ?? 0),
        ),
        resetsAt,
        used: breakdown.used,
        limit: breakdown.limit ?? null,
        unit: breakdown.resourceType,
      };
    },
  );
  const mostUsed = [...buckets].sort(
    (left, right) => right.usedPercent - left.usedPercent,
  )[0];
  return {
    source: "acp",
    planName: data.planName ?? null,
    monthly: mostUsed
      ? {
          usedPercent: mostUsed.usedPercent,
          resetsAt: mostUsed.resetsAt,
          used: mostUsed.used,
          limit: mostUsed.limit,
        }
      : null,
    buckets,
    overagesEnabled: data.overagesEnabled ?? null,
    error: null,
  };
}

async function createConnection(args: {
  executablePath: string;
  cwd: string;
}): Promise<KiroUsageConnection> {
  const client = new AcpProtocolClient({
    command: args.executablePath,
    args: ["acp"],
    cwd: args.cwd,
    env: buildKiroCliEnv({ executablePath: args.executablePath }),
    requestTimeoutMs: 15_000,
  });
  try {
    await client.initialize({
      clientName: `${USAGE_CLIENT_NAME}-usage`,
      clientVersion: USAGE_CLIENT_VERSION,
    });
    const session = await client.openSession({
      cwd: args.cwd,
      mcpServers: [],
    });
    return {
      executablePath: args.executablePath,
      client,
      sessionId: session.sessionId,
    };
  } catch (error) {
    client.close();
    throw error;
  }
}

async function getConnection(args: {
  executablePath: string;
  cwd: string;
}): Promise<KiroUsageConnection> {
  if (activeConnection?.executablePath === args.executablePath) {
    return activeConnection;
  }
  if (!connecting) {
    resetActiveConnection();
    connecting = createConnection(args).then((connection) => {
      activeConnection = connection;
      return connection;
    });
  }
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function fetchKiroUsageSnapshot(args: {
  cwd?: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Promise<KiroUsageSnapshot> {
  const executablePath = resolveKiroExecutablePath({
    explicitPath: args.runtimeOptions?.kiroBinaryPath,
  });
  if (!executablePath) {
    return unavailable("Kiro CLI was not found.");
  }
  const cwd = args.cwd && path.isAbsolute(args.cwd) ? args.cwd : process.cwd();
  try {
    const connection = await getConnection({ executablePath, cwd });
    const response = await connection.client.request(
      "_kiro.dev/commands/execute",
      {
        sessionId: connection.sessionId,
        command: { command: "usage", args: {} },
      },
      KiroUsageResponseSchema,
    );
    armIdleClose();
    return (
      mapKiroUsageResponse(response) ??
      unavailable("Kiro usage response was not recognized.")
    );
  } catch {
    resetActiveConnection();
    return unavailable("Kiro usage is unavailable. Sign in and retry.");
  }
}
