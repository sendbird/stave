import { formatList } from "@/i18n/format";
import { i18n } from "@/i18n/runtime";
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
  "id" | "role" | "providerId" | "model" | "modelInfo" | "modelResolution"
>;

interface ReplyModelIdentity {
  providerId: ProviderId;
  /** Name plus the details that pick a model variant (context, thinking). */
  model: string;
  /** Effort labels; empty when the reply recorded none. */
  effort: string;
  label: string;
}

function toReplyModelIdentity(
  message: ModelMessage,
  providerId: ProviderId,
): ReplyModelIdentity {
  const { name, details } = getTurnModelInfoParts(message);
  const variant: string[] = [];
  const effort: string[] = [];
  const shown: string[] = [];
  for (const detail of details) {
    const kind = classifyTurnModelDetail(detail);
    // Fast mode changes speed, not the model or its effort.
    if (kind === "fast") continue;
    (kind === "effort" ? effort : variant).push(detail);
    shown.push(detail);
  }
  return {
    providerId,
    model: [name, ...variant].join(" · "),
    effort: effort.join(" · "),
    label: [name, ...shown].join(" · "),
  };
}

function isModelChange(previous: ReplyModelIdentity, next: ReplyModelIdentity) {
  if (previous.providerId !== next.providerId) return true;
  if (previous.model !== next.model) return true;
  // A reply that recorded no effort (an older row, or a model without one)
  // cannot show that the effort changed.
  return Boolean(previous.effort && next.effort && previous.effort !== next.effort);
}

function withProvider(identity: ReplyModelIdentity) {
  return `${getProviderLabel({ providerId: identity.providerId })} · ${identity.label}`;
}

/**
 * Marks each assistant reply whose provider, model or effort differs from the
 * assistant reply before it, keyed by the later reply's id. Stave's own notices
 * (`providerId: "user"`) and rows without a model neither carry nor reset the
 * comparison. A reply Auto routed already names its model on its route line, so
 * it gets no second marker; the reply after it still compares against it.
 */
export function buildModelChangeMarkers(
  messages: readonly ModelMessage[],
): Map<string, ModelChangeMarker> {
  const markers = new Map<string, ModelChangeMarker>();
  let previous: ReplyModelIdentity | null = null;
  for (const message of messages) {
    const providerId = message.providerId;
    if (message.role !== "assistant" || providerId === "user" || !message.model) {
      continue;
    }
    const identity = toReplyModelIdentity(message, providerId);
    if (previous && !message.modelResolution && isModelChange(previous, identity)) {
      // Two providers can serve a model under one name; say which ran.
      const sameLabel = previous.label === identity.label;
      markers.set(message.id, {
        from: sameLabel ? withProvider(previous) : previous.label,
        to: sameLabel ? withProvider(identity) : identity.label,
      });
    }
    previous = identity;
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
