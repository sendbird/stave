import { TARS_STORAGE_BUSY_MESSAGE, TarsControlReasonSchema, TarsDelegateReasonSchema } from "@/lib/tars/conversation";

/**
 * Translation key for a refused control. The host's English diagnostic is never
 * shown; an unrecognized or missing code falls back to the generic reason.
 */
export function tarsControlReasonKey(reason: unknown) {
  const parsed = TarsControlReasonSchema.safeParse(reason);
  return `shell:tars.controlReasons.${parsed.success ? parsed.data : "unknown"}` as const;
}

/** A thrown control request confirmed no change; only a lock wait has its own retry advice. */
export function tarsControlFailureKey(cause: unknown) {
  return cause instanceof Error && cause.message.includes(TARS_STORAGE_BUSY_MESSAGE)
    ? "shell:tars.controlReasons.storageBusy" as const : "shell:tars.controlReasons.unknown" as const;
}

/** Translation key for a refused delegate agent, or null when the refusal carries no code. */
export function tarsDelegateReasonKey(reason: unknown) {
  const parsed = TarsDelegateReasonSchema.safeParse(reason);
  return parsed.success ? `shell:tars.delegateReasons.${parsed.data}` as const : null;
}
