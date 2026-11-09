import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes } from "react";
import { useEffect, useMemo, useRef } from "react";
import { cx, sx } from "@/components/aui/utils/stylex";
import {
  HTML_FILE_PREVIEW_FRAME_SANDBOX,
  buildHtmlFilePreviewDocument,
  isHtmlFilePreviewSaveMessage,
} from "@/lib/editor/html-file-preview";

interface EditorHtmlPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  /** The frame's accessible name, usually the file name. */
  frameTitle: string;
  /** Cmd/Ctrl+S pressed while the page holds focus. */
  onSaveShortcut?: () => void;
}

/**
 * The rendered view of an `.html` editor tab. The page runs in a sandboxed
 * frame (see `html-file-preview.ts`) and re-renders whenever the tab content
 * changes, so an edit or an agent's write shows on the next switch to preview.
 */
export function EditorHtmlPreview({
  content,
  frameTitle,
  onSaveShortcut,
  className,
  ...props
}: EditorHtmlPreviewProps) {
  const srcDoc = useMemo(() => buildHtmlFilePreviewDocument(content), [content]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  onSaveShortcutRef.current = onSaveShortcut;

  // Key events stay inside the frame, so it posts the save shortcut up. Only
  // this frame's message counts, and only while it holds focus in a focused
  // window: `activeElement` stays on the frame after the user switches to
  // another app, so a page timer could otherwise save the tab while the user
  // is elsewhere.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (
        !frame ||
        event.source !== frame.contentWindow ||
        document.activeElement !== frame ||
        !document.hasFocus() ||
        !isHtmlFilePreviewSaveMessage(event.data)
      ) {
        return;
      }
      onSaveShortcutRef.current?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className={cx(sx(styles.root), className)} {...props}>
      <iframe
        ref={frameRef}
        title={frameTitle}
        srcDoc={srcDoc}
        sandbox={HTML_FILE_PREVIEW_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        allow=""
        {...stylex.props(styles.frame)}
      />
    </div>
  );
}

const styles = stylex.create({
  root: { height: "100%", overflow: "hidden", backgroundColor: "var(--editor)" },
  // A page renders as it would in a browser tab: on a light canvas, whatever
  // the app theme, unless the page declares its own color scheme.
  frame: {
    display: "block",
    width: "100%",
    height: "100%",
    borderWidth: 0,
    colorScheme: "light",
    backgroundColor: "Canvas",
  },
});
