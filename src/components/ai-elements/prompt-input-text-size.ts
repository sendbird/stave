import { scaleMessageFontSize, type MessageTextScale } from "./message-text-scale";

export function composerFontSize(scale: MessageTextScale, size: number, minimal: boolean) {
  return scaleMessageFontSize(scale, size) * (minimal ? 15 / 16 : 1);
}
