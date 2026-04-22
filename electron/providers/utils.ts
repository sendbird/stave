export function toText(value: unknown): string {
  if (value instanceof Error) {
    const cause = "cause" in value && value.cause ? ` | cause: ${toText(value.cause)}` : "";
    return `${value.name}: ${value.message}${cause}`;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
