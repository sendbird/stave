/**
 * The `hostContext` a view receives in its `ui/initialize` result and in
 * `ui/notifications/host-context-changed`: theme, style variables under the
 * extension's standard names, display mode, container size, locale, platform,
 * and the tool that produced the view.
 */
import {
  sanitizeInlineRenderTheme,
  type InlineRenderTheme,
} from "@/lib/inline-render/inline-render";
import type { McpAppDisplayMode } from "./mcp-app-view";

/**
 * Stave role tokens behind each standard variable. Names the extension
 * defines but Stave has no token for are left out, so a view falls back to
 * its own value instead of a guess.
 */
const STYLE_VARIABLE_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ["--color-background-primary", "--background"],
  ["--color-background-secondary", "--card"],
  ["--color-background-tertiary", "--muted"],
  ["--color-background-inverse", "--foreground"],
  ["--color-background-info", "--info"],
  ["--color-background-danger", "--destructive"],
  ["--color-background-success", "--success"],
  ["--color-background-warning", "--warning"],
  ["--color-background-disabled", "--muted"],
  ["--color-text-primary", "--foreground"],
  ["--color-text-secondary", "--muted-foreground"],
  ["--color-text-tertiary", "--muted-foreground"],
  ["--color-text-inverse", "--background"],
  ["--color-text-info", "--info"],
  ["--color-text-danger", "--destructive"],
  ["--color-text-success", "--success"],
  ["--color-text-warning", "--warning"],
  ["--color-text-disabled", "--muted-foreground"],
  ["--color-border-primary", "--border"],
  ["--color-border-secondary", "--input"],
  ["--color-border-tertiary", "--border"],
  ["--color-border-inverse", "--foreground"],
  ["--color-border-info", "--info"],
  ["--color-border-danger", "--destructive"],
  ["--color-border-success", "--success"],
  ["--color-border-warning", "--warning"],
  ["--color-border-disabled", "--border"],
  ["--color-ring-primary", "--ring"],
  ["--color-ring-secondary", "--ring"],
  ["--color-ring-info", "--info"],
  ["--color-ring-danger", "--destructive"],
  ["--color-ring-success", "--success"],
  ["--color-ring-warning", "--warning"],
  ["--font-sans", "--font-sans"],
  ["--font-mono", "--font-mono"],
  ["--border-radius-md", "--radius"],
];

/** Maps the app's resolved theme onto the extension's style variable names. */
export function buildMcpAppStyleVariables(theme: InlineRenderTheme): Record<string, string> {
  const { variables } = sanitizeInlineRenderTheme(theme);
  const mapped: Record<string, string> = {};
  for (const [name, source] of STYLE_VARIABLE_SOURCES) {
    const value = variables[source];
    if (value) mapped[name] = value;
  }
  return mapped;
}

export interface McpAppToolInfo {
  id?: string;
  tool: { name: string; title?: string; inputSchema: { type: "object" } };
}

export interface McpAppHostContext {
  theme: "light" | "dark";
  styles: { variables: Record<string, string> };
  displayMode: McpAppDisplayMode;
  availableDisplayModes: McpAppDisplayMode[];
  containerDimensions: { maxHeight: number; width?: number; maxWidth?: number };
  locale: string;
  timeZone?: string;
  platform: "desktop" | "web";
  userAgent: string;
  toolInfo?: McpAppToolInfo;
}

export function buildMcpAppHostContext(args: {
  theme: InlineRenderTheme;
  displayMode: McpAppDisplayMode;
  maxHeight: number;
  width?: number;
  locale: string;
  timeZone?: string;
  platform: "desktop" | "web";
  tool: { name: string; title?: string; callId?: string };
}): McpAppHostContext {
  return {
    theme: args.theme.appearance === "dark" ? "dark" : "light",
    styles: { variables: buildMcpAppStyleVariables(args.theme) },
    displayMode: args.displayMode,
    availableDisplayModes: ["inline", "fullscreen"],
    containerDimensions: {
      maxHeight: Math.max(0, Math.round(args.maxHeight)),
      ...(typeof args.width === "number" && args.width > 0 ? { width: Math.round(args.width) } : {}),
    },
    locale: args.locale,
    ...(args.timeZone ? { timeZone: args.timeZone } : {}),
    platform: args.platform,
    userAgent: "Stave",
    toolInfo: {
      ...(args.tool.callId ? { id: args.tool.callId } : {}),
      tool: {
        name: args.tool.name,
        ...(args.tool.title ? { title: args.tool.title } : {}),
        inputSchema: { type: "object" },
      },
    },
  };
}
