import type { ProviderId } from "@/lib/providers/provider.types";
import { listProviderIds } from "@/lib/providers/model-catalog";

/**
 * Status-bar usage polling cadence.
 *
 * Every provider read behind this timer is an authenticated request against
 * the user's own account, so the timer — not the user — is the largest source
 * of background traffic the app produces. A flat short interval is the wrong
 * shape for that: it keeps requesting while nobody is looking at the numbers,
 * and a steady machine-regular beat against an account endpoint is what
 * automated-traffic heuristics are built to notice.
 *
 * Two ideas do the work here, and they are deliberately separate.
 *
 * **The tier decides how often the app *thinks* about usage.** It is a pure
 * function of visibility, how recently the meter was opened, how recently the
 * user touched the window, and whether a turn is actually running. Evaluating
 * a tier costs nothing, so it can be tight.
 *
 * **The per-provider reason decides whether a read actually happens.** A
 * provider's numbers cannot change unless something spends its quota or its
 * window rolls over, and both of those are observable locally: Stave *is* the
 * agent client, so it knows which provider a turn belongs to, and the previous
 * snapshot already carries `resetsAt`. So a provider is read when there is a
 * reason to believe the number moved — not because a clock ticked.
 *
 * The result is that an open, idle app with no turns running issues no reads at
 * all beyond a one-hour drift floor, while a provider that is actively being
 * spent is refreshed every few minutes. The 2–30 minute band is the range
 * a usage meter can occupy without becoming a steady authenticated beat;
 * the activity signal is exact here because Stave already knows which
 * provider a turn belongs to.
 *
 * All of the state below is deliberately in-memory only. It is a UI freshness
 * hint, not state worth persisting, and a restored "last interaction" from days
 * ago would only mislead the first tier decision.
 */

/** The meter is open: the user is reading these numbers right now. */
export const RATE_LIMITS_INTERVAL_METER_MS = 2 * 60_000;
/** A turn is spending this provider's quota. */
export const RATE_LIMITS_INTERVAL_ACTIVE_MS = 5 * 60_000;
/** Same session, attention has moved on. */
export const RATE_LIMITS_INTERVAL_WARM_MS = 5 * 60_000;
/** App has been open and unattended for a while. */
export const RATE_LIMITS_INTERVAL_IDLE_MS = 15 * 60_000;
/** App is effectively abandoned but still running. */
export const RATE_LIMITS_INTERVAL_LONG_IDLE_MS = 30 * 60_000;

/** How long opening the meter keeps the app in the fastest tier. */
export const RATE_LIMITS_METER_RECENT_MS = 5 * 60_000;
/** How long turn activity keeps the *tier* fast. */
export const RATE_LIMITS_ACTIVITY_RECENT_MS = 5 * 60_000;
/**
 * How long turn activity remains a reason to re-read *that provider*. Wider
 * than the tier window because usage keeps settling after a turn ends, and
 * because a normal working rhythm has gaps between turns.
 */
export const RATE_LIMITS_PROVIDER_ACTIVITY_MS = 15 * 60_000;
export const RATE_LIMITS_WARM_UNTIL_MS = 60 * 60_000;
export const RATE_LIMITS_IDLE_UNTIL_MS = 4 * 60 * 60_000;
/**
 * Longest a reading is trusted with no local reason to re-read it. Usage spent
 * outside Stave — a bare `claude` in a terminal, the ChatGPT web app — is
 * invisible here, so the numbers can drift with no local signal at all. This
 * bounds that drift without turning into a poll: one read per provider per
 * hour, and only while someone has used the app in the last few hours.
 */
export const RATE_LIMITS_DRIFT_FLOOR_MS = 60 * 60_000;

export type RateLimitsPollTier =
  | "hidden"
  | "meterOpen"
  | "turnActivity"
  | "warm"
  | "idle"
  | "longIdle";

/** Why a specific provider is being read on this tick. */
export type RateLimitsReadReason =
  | "initial"
  | "meterOpen"
  | "windowReset"
  | "turnActivity"
  | "drift";

export interface RateLimitsPollDecision {
  tier: RateLimitsPollTier;
  intervalMs: number;
}

export interface RateLimitsPollInputs {
  meterOpenProviders: readonly ProviderId[];
  lastMeterOpenAt: number;
  lastInteractionAt: number;
  activityAtByProvider: Partial<Record<ProviderId, number>>;
}

let lastInteractionAt = Date.now();
let lastMeterOpenAt = 0;
const meterOpenProviders = new Set<ProviderId>();
const activityAtByProvider = new Map<ProviderId, number>();
const wakeListeners = new Set<() => void>();

/**
 * Subscribe to "a signal just unlocked a faster tier".
 *
 * Without this, opening the meter while the app sits in the 30-minute tier
 * would leave the user staring at an old number until the pending timer
 * happened to fire. Only tier-changing transitions notify — not every turn
 * event — so the tick loop is re-armed at most once per activity window.
 */
export function subscribeRateLimitsPollWake(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => {
    wakeListeners.delete(listener);
  };
}

function notifyRateLimitsPollWake() {
  for (const listener of [...wakeListeners]) {
    listener();
  }
}

/**
 * Record incidental attention: bringing the window back to the foreground.
 * Deliberately *not* the fastest tier — returning to the window says the user
 * is working, not that they are watching a quota. Only moves the timestamp
 * forward, so a clock adjustment cannot park the app in a fast tier.
 */
export function noteRateLimitsInteraction(now: number = Date.now()) {
  if (now > lastInteractionAt) {
    lastInteractionAt = now;
  }
}

/**
 * The usage meter for `providerId` was opened. This is the one unambiguous
 * "show me the numbers" signal, and the only thing that unlocks the fastest
 * tier — matching how peer menu-bar monitors treat their menu being open.
 */
export function noteRateLimitsMeterOpen(
  providerId: ProviderId,
  now: number = Date.now(),
) {
  meterOpenProviders.add(providerId);
  if (now > lastMeterOpenAt) {
    lastMeterOpenAt = now;
  }
  noteRateLimitsInteraction(now);
  notifyRateLimitsPollWake();
}

/** The meter closed. Closing is itself recent attention, so the tier decays. */
export function noteRateLimitsMeterClosed(
  providerId: ProviderId,
  now: number = Date.now(),
) {
  meterOpenProviders.delete(providerId);
  if (now > lastMeterOpenAt) {
    lastMeterOpenAt = now;
  }
}

/**
 * A turn for `providerId` produced activity. Called on turn start, on turn
 * events, and on completion — it is a cheap monotonic timestamp write, not a
 * store update, precisely because the turn event path is hot.
 */
export function noteRateLimitsProviderActivity(
  providerId: ProviderId,
  now: number = Date.now(),
) {
  const previous = activityAtByProvider.get(providerId) ?? 0;
  if (now <= previous) {
    return;
  }
  activityAtByProvider.set(providerId, now);
  // Only the transition from "quiet" to "active" changes the tier, so a long
  // turn emitting events continuously re-arms the loop once, not per event.
  if (now - previous > RATE_LIMITS_ACTIVITY_RECENT_MS) {
    notifyRateLimitsPollWake();
  }
}

export function readRateLimitsPollInputs(): RateLimitsPollInputs {
  return {
    meterOpenProviders: [...meterOpenProviders],
    lastMeterOpenAt,
    lastInteractionAt,
    activityAtByProvider: Object.fromEntries(activityAtByProvider) as Partial<
      Record<ProviderId, number>
    >,
  };
}

export function readRateLimitsInteractionAt(): number {
  return lastInteractionAt;
}

/** Test seam; production only ever moves these forward. */
export function resetRateLimitsInteractionForTests(now: number) {
  lastInteractionAt = now;
  lastMeterOpenAt = 0;
  meterOpenProviders.clear();
  activityAtByProvider.clear();
  wakeListeners.clear();
}

/**
 * Age of a timestamp, with future values treated as "just now" rather than as
 * an enormous negative age (clock changes, coarse timers).
 */
function ageMs(now: number, at: number | undefined): number {
  if (at === undefined || at <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, now - at);
}

/**
 * First match wins. A hidden window still gets a slow recheck cadence rather
 * than zero, because the timer is also how the app notices it became visible
 * again on platforms that coalesce visibility events — but no provider is
 * actually read while hidden (see `resolveRateLimitsPollPlan`).
 */
export function resolveRateLimitsPollDecision(args: {
  now: number;
  visible: boolean;
  lastInteractionAt: number;
  lastMeterOpenAt?: number;
  meterOpenProviders?: readonly ProviderId[];
  activityAtByProvider?: Partial<Record<ProviderId, number>>;
}): RateLimitsPollDecision {
  if (!args.visible) {
    return { tier: "hidden", intervalMs: RATE_LIMITS_INTERVAL_LONG_IDLE_MS };
  }
  const meterIsOpen = (args.meterOpenProviders?.length ?? 0) > 0;
  if (
    meterIsOpen ||
    ageMs(args.now, args.lastMeterOpenAt) <= RATE_LIMITS_METER_RECENT_MS
  ) {
    return { tier: "meterOpen", intervalMs: RATE_LIMITS_INTERVAL_METER_MS };
  }
  const activityAges = Object.values(args.activityAtByProvider ?? {}).map((at) =>
    ageMs(args.now, at),
  );
  const newestActivityAgeMs = activityAges.length
    ? Math.min(...activityAges)
    : Number.POSITIVE_INFINITY;
  if (newestActivityAgeMs <= RATE_LIMITS_ACTIVITY_RECENT_MS) {
    return {
      tier: "turnActivity",
      intervalMs: RATE_LIMITS_INTERVAL_ACTIVE_MS,
    };
  }
  const sinceInteractionMs = ageMs(args.now, args.lastInteractionAt);
  if (sinceInteractionMs <= RATE_LIMITS_WARM_UNTIL_MS) {
    return { tier: "warm", intervalMs: RATE_LIMITS_INTERVAL_WARM_MS };
  }
  if (sinceInteractionMs <= RATE_LIMITS_IDLE_UNTIL_MS) {
    return { tier: "idle", intervalMs: RATE_LIMITS_INTERVAL_IDLE_MS };
  }
  return { tier: "longIdle", intervalMs: RATE_LIMITS_INTERVAL_LONG_IDLE_MS };
}

/**
 * Why this provider may be read, and how fresh its reading has to be for that
 * reason. `null` means there is no reason to read it at all: nothing local has
 * spent its quota, its window has not rolled over, and nobody is looking.
 */
function resolveProviderReadReason(args: {
  providerId: ProviderId;
  now: number;
  updatedAt: number | undefined;
  resetsAtMs: number | null | undefined;
  meterOpen: boolean;
  activityAt: number | undefined;
  lastInteractionAt: number;
}): { reason: RateLimitsReadReason; freshnessMs: number } | null {
  if (args.updatedAt === undefined) {
    return { reason: "initial", freshnessMs: 0 };
  }
  if (args.meterOpen) {
    return {
      reason: "meterOpen",
      freshnessMs: RATE_LIMITS_INTERVAL_METER_MS,
    };
  }
  // A window that has rolled over since the last read makes that reading
  // definitively wrong, and the boundary is already known locally — so this
  // needs one scheduled read, not a poll waiting to notice.
  if (
    args.resetsAtMs != null &&
    Number.isFinite(args.resetsAtMs) &&
    args.now >= args.resetsAtMs &&
    args.updatedAt < args.resetsAtMs
  ) {
    return { reason: "windowReset", freshnessMs: 0 };
  }
  if (ageMs(args.now, args.activityAt) <= RATE_LIMITS_PROVIDER_ACTIVITY_MS) {
    return {
      reason: "turnActivity",
      freshnessMs: RATE_LIMITS_INTERVAL_ACTIVE_MS,
    };
  }
  if (ageMs(args.now, args.lastInteractionAt) <= RATE_LIMITS_IDLE_UNTIL_MS) {
    return { reason: "drift", freshnessMs: RATE_LIMITS_DRIFT_FLOOR_MS };
  }
  return null;
}

export interface RateLimitsPollPlan extends RateLimitsPollDecision {
  providers: ProviderId[];
  reasonByProvider: Partial<Record<ProviderId, RateLimitsReadReason>>;
}

/**
 * The whole tick decision in one pure function: how long until the next
 * evaluation, and which providers to read now.
 *
 * `resetsAtMsByProvider` carries the tightest known window boundary per
 * provider, in epoch milliseconds — the caller converts, because the snapshot
 * reports `resetsAt` in seconds and mixing the two units silently disables the
 * reset reason.
 */
export function resolveRateLimitsPollPlan(args: {
  now: number;
  visible: boolean;
  inputs: RateLimitsPollInputs;
  updatedAtByProvider: Partial<Record<ProviderId, number>>;
  resetsAtMsByProvider?: Partial<Record<ProviderId, number | null>>;
  providers?: readonly ProviderId[];
}): RateLimitsPollPlan {
  const decision = resolveRateLimitsPollDecision({
    now: args.now,
    visible: args.visible,
    lastInteractionAt: args.inputs.lastInteractionAt,
    lastMeterOpenAt: args.inputs.lastMeterOpenAt,
    meterOpenProviders: args.inputs.meterOpenProviders,
    activityAtByProvider: args.inputs.activityAtByProvider,
  });
  if (decision.tier === "hidden") {
    return { ...decision, providers: [], reasonByProvider: {} };
  }
  const meterOpen = new Set(args.inputs.meterOpenProviders);
  const providers: ProviderId[] = [];
  const reasonByProvider: Partial<Record<ProviderId, RateLimitsReadReason>> =
    {};
  for (const providerId of args.providers ?? listProviderIds()) {
    const updatedAt = args.updatedAtByProvider[providerId];
    const resolved = resolveProviderReadReason({
      providerId,
      now: args.now,
      updatedAt,
      resetsAtMs: args.resetsAtMsByProvider?.[providerId],
      meterOpen: meterOpen.has(providerId),
      activityAt: args.inputs.activityAtByProvider[providerId],
      lastInteractionAt: args.inputs.lastInteractionAt,
    });
    if (!resolved) {
      continue;
    }
    // The tier interval is a floor on every reason: a fast reason can never
    // read more often than the tier the app is currently in.
    const freshnessMs = Math.max(resolved.freshnessMs, decision.intervalMs);
    if (ageMs(args.now, updatedAt) >= freshnessMs) {
      providers.push(providerId);
      reasonByProvider[providerId] = resolved.reason;
    }
  }
  return { ...decision, providers, reasonByProvider };
}
