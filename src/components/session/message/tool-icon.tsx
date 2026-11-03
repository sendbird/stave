import type { ReactNode } from "react";
import {
  FileText,
  Globe,
  Pencil,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { StaveIcon } from "@/components/brand-icons";
import { controlIconSizes } from "@/components/ads/recipes/control-metrics";
import { sx } from "@/components/ads/utils/stylex";
import { isStaveToolName } from "@/lib/tool-display-name";
import { assistantTraceStyles as styles } from "./assistant-trace.styles";
import { normalizeTraceToolName } from "./assistant-trace.utils";

/**
 * The object glyph's box. `controlIconSizes.md` is what ADS `ToolRun` sizes its
 * own glyph slot to, and passing it explicitly is what keeps a lucide icon from
 * falling back to its 24px default inside the row.
 */
export const TRACE_GLYPH_SIZE = controlIconSizes.md;

/**
 * The one glyph per tool: command, file, edit, search, web, Stave's own tools,
 * and a wrench for any other tool. Every surface that draws a tool by its
 * name (the trace's tool rows, Fleet's agent cards) reads it from here.
 */
export function getToolIcon(toolName: string): ReactNode {
  if (isStaveToolName(toolName)) {
    return <StaveIcon className={sx(styles.glyphEm)} />;
  }

  switch (normalizeTraceToolName(toolName)) {
    case "bash":
      return <Terminal size={TRACE_GLYPH_SIZE} />;
    case "read":
    case "write":
      return <FileText size={TRACE_GLYPH_SIZE} />;
    case "edit":
      return <Pencil size={TRACE_GLYPH_SIZE} />;
    case "glob":
    case "grep":
    /* ACP `search` kind — the canonical name ACP providers map onto. */
    case "search":
      return <Search size={TRACE_GLYPH_SIZE} />;
    case "websearch":
    case "webfetch":
      return <Globe size={TRACE_GLYPH_SIZE} />;
    default:
      return <Wrench size={TRACE_GLYPH_SIZE} />;
  }
}
