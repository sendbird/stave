import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AccountUsageBucket,
  CursorUsageSnapshot,
} from "../../../src/lib/providers/provider.types";

const CURSOR_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const REQUEST_TIMEOUT_MS = 10_000;
const CURSOR_ACCESS_TOKEN_KEY = "cursorAuth/accessToken";

type CursorDashboardUsage = {
  totalPercentUsed?: unknown;
  autoPercentUsed?: unknown;
  apiPercentUsed?: unknown;
  totalSpend?: unknown;
  includedSpend?: unknown;
  limit?: unknown;
};

type CursorDashboardResponse = {
  billingCycleEnd?: unknown;
  planType?: unknown;
  plan?: unknown;
  planUsage?: CursorDashboardUsage;
};

function unavailable(error: string): CursorUsageSnapshot {
  return {
    source: "unavailable",
    planType: null,
    monthly: null,
    buckets: [],
    error,
  };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function percent(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.min(100, Math.max(0, parsed));
}

function epochSeconds(value: unknown): number | null {
  if (
    typeof value === "string" &&
    value.trim() &&
    !Number.isNaN(Number(value))
  ) {
    value = Number(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value > 10_000_000_000 ? value / 1_000 : value);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.round(parsed / 1_000);
  }
  return null;
}

function usageBucket(args: {
  id: string;
  label: string;
  value: unknown;
  resetsAt: number | null;
}): AccountUsageBucket | null {
  const usedPercent = percent(args.value);
  return usedPercent === null
    ? null
    : {
        id: args.id,
        label: args.label,
        usedPercent,
        resetsAt: args.resetsAt,
        used: null,
        limit: null,
        unit: null,
      };
}

export function mapCursorUsageResponse(
  raw: unknown,
): CursorUsageSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const response = raw as CursorDashboardResponse;
  const usage = response.planUsage;
  const usedPercent = percent(usage?.totalPercentUsed);
  if (!usage || usedPercent === null) {
    return null;
  }
  const resetsAt = epochSeconds(response.billingCycleEnd);
  const includedSpend =
    finiteNumber(usage.includedSpend) ?? finiteNumber(usage.totalSpend);
  const limit = finiteNumber(usage.limit);
  const buckets = [
    usageBucket({
      id: "cursor-models",
      label: "Cursor models",
      value: usage.autoPercentUsed,
      resetsAt,
    }),
    usageBucket({
      id: "other-models",
      label: "Other models",
      value: usage.apiPercentUsed,
      resetsAt,
    }),
  ].filter((bucket): bucket is AccountUsageBucket => bucket !== null);
  const planType =
    typeof response.planType === "string"
      ? response.planType
      : typeof response.plan === "string"
        ? response.plan
        : null;
  return {
    source: "dashboard",
    planType,
    monthly: {
      usedPercent,
      resetsAt,
      used: includedSpend === null ? null : includedSpend / 100,
      limit: limit === null ? null : limit / 100,
    },
    buckets,
    error: null,
  };
}

function cursorIdeDatabasePath(): string {
  if (process.platform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb",
    );
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "Cursor",
    "User",
    "globalStorage",
    "state.vscdb",
  );
}

function parseStoredToken(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" && parsed.trim() ? parsed : null;
  } catch {
    return value;
  }
}

function readCursorAgentToken(): string | null {
  try {
    const raw: unknown = JSON.parse(
      readFileSync(
        path.join(homedir(), ".config", "cursor", "auth.json"),
        "utf8",
      ),
    );
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return parseStoredToken((raw as Record<string, unknown>).accessToken);
  } catch {
    return null;
  }
}

function readCursorIdeToken(): string | null {
  let database: Database.Database | null = null;
  try {
    database = new Database(cursorIdeDatabasePath(), {
      readonly: true,
      fileMustExist: true,
    });
    const row = database
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get(CURSOR_ACCESS_TOKEN_KEY) as { value?: unknown } | undefined;
    return parseStoredToken(row?.value);
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function fetchCursorUsageSnapshot(): Promise<CursorUsageSnapshot> {
  const accessToken = readCursorAgentToken() ?? readCursorIdeToken();
  if (!accessToken) {
    return unavailable("Sign in to Cursor Agent or Cursor IDE to view usage.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(CURSOR_USAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: "{}",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return unavailable("Cursor sign-in expired. Sign in again and retry.");
    }
    if (!response.ok) {
      return unavailable(
        `Cursor usage request failed (HTTP ${response.status}).`,
      );
    }
    const snapshot = mapCursorUsageResponse(await response.json());
    return snapshot ?? unavailable("Cursor usage response was not recognized.");
  } catch {
    return unavailable("Cursor usage request failed.");
  } finally {
    clearTimeout(timeout);
  }
}
