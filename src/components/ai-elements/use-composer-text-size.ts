import type { CSSProperties } from "react";
import { useAppStore } from "@/store/app.store";
import { useMessageTextScale } from "./message-text-scale";
import { MESSAGE_BODY_LINE_HEIGHT } from "./message-styles";
import { composerFontSize } from "./prompt-input-text-size";

export function useComposerTextSize(minimal: boolean): CSSProperties {
  const scale = useMessageTextScale();
  const size = useAppStore((state) => state.settings.messageFontSize);
  return { "--composer-font-size": `${composerFontSize(scale, size, minimal)}px`,
    "--composer-line-height": String(MESSAGE_BODY_LINE_HEIGHT) } as CSSProperties;
}
