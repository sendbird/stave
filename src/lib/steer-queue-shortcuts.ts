/**
 * Which explicit action (steer vs queue) Enter triggers during an active
 * turn's "steer-or-queue" composer mode. Tab always triggers the other
 * action — see `tabActionForSteerQueueEnterAction`. Neither is a fallback
 * for the other; the user picks per keystroke (see `sendUserMessage`'s
 * `submitIntent` param).
 */
export type SteerQueueEnterAction = "steer" | "queue";

/**
 * Default mirrors Codex CLI's "queue by default, steer is the deliberate
 * escalation" posture: Enter queues (matches ordinary chat-input muscle
 * memory), Tab explicitly steers into the live turn.
 */
export const DEFAULT_STEER_QUEUE_ENTER_ACTION: SteerQueueEnterAction = "queue";

export const STEER_QUEUE_ENTER_ACTION_OPTIONS: readonly {
  value: SteerQueueEnterAction;
  label: string;
  description: string;
}[] = [
  {
    value: "queue",
    label: "Enter queues, Tab steers",
    description:
      "Enter queues the message for after the turn finishes. Tab steers it into the live turn immediately.",
  },
  {
    value: "steer",
    label: "Enter steers, Tab queues",
    description:
      "Enter steers the message into the live turn immediately. Tab queues it for after the turn finishes.",
  },
];

export function normalizeSteerQueueEnterAction(
  value: unknown,
): SteerQueueEnterAction {
  return value === "steer" || value === "queue"
    ? value
    : DEFAULT_STEER_QUEUE_ENTER_ACTION;
}

export function formatSteerQueueEnterActionLabel(
  action: SteerQueueEnterAction,
) {
  const normalized = normalizeSteerQueueEnterAction(action);
  return (
    STEER_QUEUE_ENTER_ACTION_OPTIONS.find(
      (option) => option.value === normalized,
    )?.label ?? "Enter queues, Tab steers"
  );
}

/** The intent Tab triggers, given the configured Enter action. */
export function tabActionForSteerQueueEnterAction(
  enterAction: SteerQueueEnterAction,
): SteerQueueEnterAction {
  return enterAction === "steer" ? "queue" : "steer";
}
