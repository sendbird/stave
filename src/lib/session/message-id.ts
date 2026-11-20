/**
 * Message ids are the durable row key. The position alone is not unique: a
 * renderer whose window fell behind the database computes a position that is
 * already taken. A turn id, when the message belongs to one, keeps the id
 * deterministic for every writer of that turn and unique across turns.
 */
export function buildMessageId(args: {
  taskId: string;
  count: number;
  turnId?: string;
}) {
  const position = `${messageIdPrefix(args.taskId)}${args.count + 1}`;
  return args.turnId ? `${position}-${args.turnId}` : position;
}

function messageIdPrefix(taskId: string) {
  return `${taskId}-m-`;
}

/** A pending row carries its turn in its durable id before the first event arrives. */
export function readMessageIdTurnId(args: { taskId: string; id: string }) {
  const prefix = messageIdPrefix(args.taskId);
  if (!args.id.startsWith(prefix)) return undefined;
  return /^\d+-(.+)$/.exec(args.id.slice(prefix.length))?.[1];
}
