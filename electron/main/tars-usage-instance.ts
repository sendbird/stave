import { ensurePersistenceReady } from "./state";
import { readTarsUsageReport } from "./tars-usage";
import type { TarsUsageInput } from "../../src/lib/tars/usage";

/** The usage report from main's own persistence connection; reading changes nothing. */
export async function getTarsUsageReport(period: TarsUsageInput) {
  return readTarsUsageReport(await ensurePersistenceReady(), period, new Date().toISOString());
}
