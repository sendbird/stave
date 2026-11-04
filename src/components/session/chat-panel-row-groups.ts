import { formatList } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
import {
  getCursorModelBaseId,
  parseCursorModelParameters,
} from "@/lib/providers/cursor-model-id";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import {
  classifyTurnModelDetail,
  getTurnModelInfoParts,
} from "@/lib/providers/turn-model-info";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

/**
 * Row relationships the transcript derives from message metadata alone, so
 * every provider behaves the same and no row needs its own store subscription:
 * the model-change marker above a reply and the grouping of user messages sent
 * back to back.
 */

export interface ModelChangeMarker {
  /** The earlier reply's model, e.g. `Claude Sonnet 5.5 · Medium`. */
  from: string;
  /** This reply's model. */
  to: string;
}

type ModelMessage = Pick<
  ChatMessage,
  "id" | "role" | "providerId" | "model" | "modelInfo"
>;

interface ReplyModelIdentity {
  providerId: ProviderId;
  /**
   * The model id plus the settings that pick a model variant (Cursor's context
   * or thinking), without effort or fast mode.
   */
  model: string;
  /** Raw effort value; empty when the reply recorded none. */
  effort: string;
}

// Fast mode changes speed, not the model or its effort.
const CURSOR_NON_MODEL_PARAMETERS = new Set(["fast", "effort", "reasoning"]);

function normalizeEffort(effort: string | undefined) {
  return effort?.trim().toLowerCase().replace(/[-_]/g, "") ?? "";
}

/**
 * Reads what ran from the stored ids and values, never from display labels, so
 * the comparison is the same in every language.
 */
function toReplyModelIdentity(
  message: ModelMessage,
  providerId: ProviderId,
): ReplyModelIdentity {
  if (providerId !== "cursor") {
    return {
      providerId,
      model: message.model.trim(),
      effort: normalizeEffort(message.modelInfo?.effort),
    };
  }
  // Cursor carries its settings inside the model id.
  const parameters = parseCursorModelParameters(message.model);
  const variant = [...parameters]
    .filter(([key]) => !CURSOR_NON_MODEL_PARAMETERS.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  const effort = message.model.includes("[")
    ? (parameters.get("effort") ?? parameters.get("reasoning"))
    : message.modelInfo?.effort;
  return {
    providerId,
    model: [getCursorModelBaseId(message.model), ...variant].join(","),
    effort: normalizeEffort(effort),
  };
}

function isModelChange(previous: ReplyModelIdentity, next: ReplyModelIdentity) {
  if (previous.providerId !== next.providerId) return true;
  if (previous.model !== next.model) return true;
  // A reply that recorded no effort (an older row, or a model without one)
  // cannot show that the effort changed.
  return Boolean(previous.effort && next.effort && previous.effort !== next.effort);
}

/** The reply's model as the transcript names it, without fast mode. */
function formatReplyModelLabel(message: ModelMessage) {
  const { name, details } = getTurnModelInfoParts(message);
  return [
    name,
    ...details.filter((detail) => classifyTurnModelDetail(detail) !== "fast"),
  ].join(" · ");
}

function withProvider(providerId: ProviderId, label: string) {
  return `${getProviderLabel({ providerId })} · ${label}`;
}

/**
 * Marks each assistant reply whose provider, model or effort differs from the
 * assistant reply before it, keyed by the later reply's id. Stave's own notices
 * (`providerId: "user"`) and rows without a model neither carry nor reset the
 * comparison. An Auto-routed reply compares the model that ran, not the Auto
 * selection, both as the later reply and as the earlier one.
 */
export function buildModelChangeMarkers(
  messages: readonly ModelMessage[],
): Map<string, ModelChangeMarker> {
  const markers = new Map<string, ModelChangeMarker>();
  let previous: { message: ModelMessage; identity: ReplyModelIdentity } | null =
    null;
  for (const message of messages) {
    const providerId = message.providerId;
    if (message.role !== "assistant" || providerId === "user" || !message.model) {
      continue;
    }
    const identity = toReplyModelIdentity(message, providerId);
    if (previous && isModelChange(previous.identity, identity)) {
      const from = formatReplyModelLabel(previous.message);
      const to = formatReplyModelLabel(message);
      // Two providers can serve a model under one name; say which ran.
      const marker =
        from === to
          ? {
              from: withProvider(previous.identity.providerId, from),
              to: withProvider(providerId, to),
            }
          : { from, to };
      // Ids that differ only by an alias read the same; nothing to show.
      if (marker.from !== marker.to) markers.set(message.id, marker);
    }
    previous = { message, identity };
  }
  return markers;
}

export type UserMessageGroupPosition = "first" | "middle" | "last";

export type UserMessageNoteKind =
  | "steerAccepted"
  | "steerPending"
  | "steerUnknown"
  | "steerRejected"
  | "sentFromQueue";

export interface UserMessageNoteCount {
  kind: UserMessageNoteKind;
  count: number;
}

export interface UserMessageGroupRow {
  position: UserMessageGroupPosition;
  /** On the group's last row: its notes, one entry per kind in send order. */
  notes?: UserMessageNoteCount[];
}

type GroupMessage = Pick<
  ChatMessage,
  | "id"
  | "role"
  | "steerDeliveryState"
  | "dispatchedFromQueue"
  | "agentRunPrompt"
  | "questionReply"
>;

/** The note a user message carries under its bubble, if any. */
export function getUserMessageNoteKind(
  message: Pick<ChatMessage, "steerDeliveryState" | "dispatchedFromQueue">,
): UserMessageNoteKind | null {
  switch (message.steerDeliveryState) {
    case "accepted":
      return "steerAccepted";
    case "pending":
      return "steerPending";
    case "unknown":
      return "steerUnknown";
    case "rejected":
      return "steerRejected";
    default:
      return message.dispatchedFromQueue ? "sentFromQueue" : null;
  }
}

function canJoinGroup(message: GroupMessage) {
  // An agent run's prompt and an answer to a question have their own frames.
  return message.role === "user" && !message.agentRunPrompt && !message.questionReply;
}

/**
 * Groups user messages drawn next to each other with no assistant row between
 * them, such as steers sent before the reply produced anything. Only groups of
 * two or more get an entry. A date separator starts a new group.
 */
export function buildUserMessageGroups(
  messages: readonly GroupMessage[],
  dateSeparators?: ReadonlyMap<string, string>,
): Map<string, UserMessageGroupRow> {
  const groups = new Map<string, UserMessageGroupRow>();
  let run: GroupMessage[] = [];
  const flush = () => {
    if (run.length > 1) {
      const notes: UserMessageNoteCount[] = [];
      for (const message of run) {
        const kind = getUserMessageNoteKind(message);
        if (!kind) continue;
        const entry = notes.find((note) => note.kind === kind);
        if (entry) entry.count += 1;
        else notes.push({ kind, count: 1 });
      }
      run.forEach((message, index) => {
        const position: UserMessageGroupPosition =
          index === 0 ? "first" : index === run.length - 1 ? "last" : "middle";
        groups.set(
          message.id,
          position === "last" ? { position, notes } : { position },
        );
      });
    }
    run = [];
  };
  for (const message of messages) {
    if (!canJoinGroup(message) || dateSeparators?.has(message.id)) flush();
    if (canJoinGroup(message)) run.push(message);
  }
  flush();
  return groups;
}

const NOTE_LABEL_KEYS = {
  steerAccepted: "session:chatPanel.steerDeliveryLabel",
  steerPending: "session:chatPanel.steerDeliveryLabel2",
  steerUnknown: "session:chatPanel.steerDeliveryLabel3",
  steerRejected: "session:chatPanel.steerDeliveryLabel4",
  sentFromQueue: "session:chatPanel.steerDeliveryLabel5",
} as const satisfies Record<UserMessageNoteKind, string>;

export function formatUserMessageNoteLabel(kind: UserMessageNoteKind) {
  return i18n.t(NOTE_LABEL_KEYS[kind]);
}

/** `Steered into active turn · 3`; kinds that differ are listed in send order. */
export function formatUserMessageGroupNotes(
  notes: readonly UserMessageNoteCount[] | undefined,
): string | undefined {
  if (!notes?.length) return undefined;
  return formatList(
    notes.map((note) =>
      note.count > 1
        ? i18n.t("session:chatPanel.userMessageGroupNote", {
            label: formatUserMessageNoteLabel(note.kind),
            value: note.count,
          })
        : formatUserMessageNoteLabel(note.kind),
    ),
    { type: "unit", style: "short" },
  );
}
