import { emptyRateLimitsSnapshot } from "@/lib/providers/account-usage-block";
import {
  providerReadsAllowed,
  providerSurfaceVisible,
} from "@/lib/providers/provider-readiness-store";
import type { AppState } from "./app-store.types";

/** Compatibility projections for routing and quota guards; selections stay untouched. */
export function providerToolingStatePatch(state: AppState): Partial<AppState> {
  const options = {
    cursorBinaryPath: state.settings.cursorBinaryPath,
    kiroBinaryPath: state.settings.kiroBinaryPath,
  };
  const cursor = providerReadsAllowed("cursor", options);
  const kiro = providerReadsAllowed("kiro", options);
  const empty = emptyRateLimitsSnapshot();
  return {
    providerAvailability: { ...state.providerAvailability, cursor, kiro },
    rateLimitsSnapshot: state.rateLimitsSnapshot
      ? {
          ...state.rateLimitsSnapshot,
          ...(!providerSurfaceVisible("cursor", options)
            ? { cursor: empty.cursor }
            : {}),
          ...(!providerSurfaceVisible("kiro", options)
            ? { kiro: empty.kiro }
            : {}),
        }
      : null,
    rateLimitsUpdatedAtByProvider: {
      ...state.rateLimitsUpdatedAtByProvider,
      ...(cursor !== state.providerAvailability.cursor ? { cursor: 0 } : {}),
      ...(kiro !== state.providerAvailability.kiro ? { kiro: 0 } : {}),
    },
  };
}
