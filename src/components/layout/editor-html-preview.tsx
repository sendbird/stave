import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes } from "react";
import { useMemo } from "react";
import { cx, sx } from "@/components/ads/utils/stylex";
import {
  HTML_FILE_PREVIEW_FRAME_SANDBOX,
  buildHtmlFilePreviewDocument,
} from "@/lib/editor/html-file-preview";

interface EditorHtmlPreviewProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  /** The frame's accessible name, usually the file name. */
  frameTitle: string;
}

/**
 * The rendered view of an `.html` editor tab. The page runs in a sandboxed
 * frame (see `html-file-preview.ts`) and re-renders whenever the tab content
 * changes, so an edit or an agent's write shows on the next switch to preview.
 */
export function EditorHtmlPreview({
  content,
  frameTitle,
  className,
  ...props
}: EditorHtmlPreviewProps) {
  const srcDoc = useMemo(() => buildHtmlFilePreviewDocument(content), [content]);

  return (
    <div className={cx(sx(styles.root), className)} {...props}>
      <iframe
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
