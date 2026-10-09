import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";
import { useInlineRenderTheme } from "./inline-render-theme";

/**
 * Keeps main's copy of what `stave_preview_html` renders with in step with
 * the app: the inline page network setting and the theme on screen. Main
 * renders previews but cannot read either, and gives a preview no network
 * until the first report arrives.
 *
 * A component of its own, rendering nothing, so a theme change re-renders
 * only this and not the app shell.
 */
export function InlineRenderPreviewContextSync(): null {
  const networkPolicy = useAppStore((state) => state.settings.inlineRenderNetworkPolicy);
  const theme = useInlineRenderTheme();
  useEffect(() => {
    void window.api?.inlineRender
      ?.setPreviewContext?.({ networkPolicy, theme })
      .catch(() => undefined);
  }, [networkPolicy, theme]);
  return null;
}
