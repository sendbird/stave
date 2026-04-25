export type PersistenceBootstrapPhase =
  | "idle"
  | "purging-legacy-turn-journal";

export interface PersistenceBootstrapStatus {
  phase: PersistenceBootstrapPhase;
  message: string;
}

export const IDLE_PERSISTENCE_BOOTSTRAP_STATUS: PersistenceBootstrapStatus = {
  phase: "idle",
  message: "",
};
