/** Persisted and runtime identities shared by catalogs, events and IPC validation. */
export const WORKER_PRESET_IDS = [
  "patch-hand", "verified-patch", "sweep", "scout", "deep-packet", "second-pair",
] as const;

export type WorkerPresetId = (typeof WORKER_PRESET_IDS)[number];
