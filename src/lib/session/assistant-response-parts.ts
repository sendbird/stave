import type { MessagePart, TextPart } from "@/types/chat";

function isTraceOrientedPart(part: MessagePart) {
  return part.type !== "text"
    && part.type !== "file_context"
    && part.type !== "image_context"
    && part.type !== "system_event";
}

function normalizeSegmentId(part: TextPart) {
  const segmentId = part.segmentId?.trim();
  return segmentId?.length ? segmentId : null;
}

export function getAssistantResponseTextStartIndex(parts: MessagePart[]) {
  const lastTraceOrientedPartIndex = parts.reduce((lastIndex, part, index) => (
    isTraceOrientedPart(part) ? index : lastIndex
  ), -1);

  const trailingTextParts = parts.flatMap((part, index) => (
    part.type === "text" && part.text.trim() && index > lastTraceOrientedPartIndex
      ? [{ index, part }]
      : []
  ));

  if (trailingTextParts.length === 0) {
    return -1;
  }

  const distinctTrailingSegmentIds = trailingTextParts.reduce<string[]>((segments, entry) => {
    const segmentId = normalizeSegmentId(entry.part);
    if (!segmentId || segments.at(-1) === segmentId) {
      return segments;
    }
    return [...segments, segmentId];
  }, []);

  if (distinctTrailingSegmentIds.length <= 1) {
    return trailingTextParts[0]?.index ?? -1;
  }

  const finalSegmentId = distinctTrailingSegmentIds.at(-1);
  const responseStartPart = trailingTextParts.find((entry) => normalizeSegmentId(entry.part) === finalSegmentId);
  return responseStartPart?.index ?? trailingTextParts[0]?.index ?? -1;
}
