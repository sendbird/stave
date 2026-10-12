import { isProviderBrowserAuthWallOutput } from "./provider-browser";

// Read/navigation operations only. A browser retry must never replay a write.
const LENS_READ_TOOLS = new Set([
  "stave_lens_open_session",
  "stave_lens_navigate",
  "stave_lens_reload",
  "stave_lens_snapshot",
  "stave_lens_get_text",
  "stave_lens_get_html",
  "stave_lens_screenshot",
  "stave_lens_fill_saved_account",
]);

export function isLensBrowserToolName(toolName: string) {
  return lensToolName(toolName).startsWith("stave_lens_");
}

function lensToolName(toolName: string) {
  return toolName.trim().toLowerCase().split(/:|__/).at(-1) ?? "";
}

export function isProviderBrowserFallbackLensTool(toolName: string) {
  return LENS_READ_TOOLS.has(lensToolName(toolName));
}

/** Decode only the text/structured parts of the provider's MCP result. */
export function parseLensFallbackOutput(output: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(output);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = value as Record<string, unknown>;
    if (result.structuredContent && typeof result.structuredContent === "object") {
      return { ...result.structuredContent as Record<string, unknown>, isError: result.isError };
    }
    if (Array.isArray(result.content)) {
      const text = result.content.filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text).join("\n");
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return { ...parsed as Record<string, unknown>, isError: result.isError };
        }
      } catch { /* A plain-text tool result. */ }
      return { text, isError: result.isError };
    }
    return result;
  } catch {
    return { text: output };
  }
}

export function lensFallbackOutputUrl(result: Record<string, unknown>) {
  const session = result.session as { url?: unknown } | undefined;
  const url = result.url ?? session?.url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export function isLensFallbackControlBlock(output: string) {
  return /(?:approval|permission|access|navigation|host|tool).{0,60}(?:denied|rejected|blocked|not allowed)|(?:denied|rejected|blocked).{0,60}(?:approval|permission|policy)|User denied|denied by the user|Tool use rejected|Lens automation is paused|Wait for the user to resume|requires? (?:user )?(?:approval|permission)|Lens navigation is limited by Settings|Lens Developer Mode CDP is disabled|CDP.{0,60}(?:approval|approved)/i.test(output);
}

export function isLensProviderBrowserFallbackOutput(args: {
  output: string;
  isError: boolean;
}) {
  if (isLensFallbackControlBlock(args.output)) return false;
  const result = parseLensFallbackOutput(args.output);
  const body = [result.snapshot, result.text, result.html, result.message]
    .filter((value): value is string => typeof value === "string").join("\n");
  const title = typeof result.title === "string" ? result.title : "";
  // A snapshot may be long even when it is only a login form. Pair the title
  // or a password input with a submit control instead of treating any mention
  // of login (for example a site's header link) as a blocked page.
  const loginTitle = /^(?:sign\s?in|log\s?in|login|로그인)(?:\s+to\b|\s*[-|:–]|\s*$)/i.test(title.trim());
  const loginUrl = /\/(?:login|log-in|signin|sign-in)(?:[/?#]|$)/i.test(lensFallbackOutputUrl(result) ?? "");
  const loginFields = /(?:textbox|input).{0,100}(?:password|비밀번호)|type=["']password["']/i.test(body);
  const loginSubmit = /(?:button|submit).{0,100}(?:sign\s?in|log\s?in|login|로그인)/i.test(body);
  if (isProviderBrowserAuthWallOutput(body) || (loginTitle && loginUrl) || (loginFields && loginSubmit)) return true;
  if (result.ok === false && /No (?:unambiguous )?saved Lens account matches/i.test(body)) return true;
  // Tool failures, not errors mentioned by the inspected app. Ref/selector
  // mistakes remain in Lens; a different browser cannot repair them.
  return (args.isError || result.isError === true || result.ok === false) &&
    /Navigation timed out|Timed out[\s\S]{0,100}waiting for the Stave window to open a Lens page|ERR_(?:CONNECTION|TIMED_OUT|PROXY|TUNNEL|CERT|SSL|BLOCKED_BY_RESPONSE)|(?:Lens|browser|webContents|web contents|session).{0,60}(?:unavailable|not available|not ready|destroyed|closed|crashed)|No Lens browser session found|Object has been destroyed|Lens needs an open Stave window|Target closed|Session closed/i.test(body);
}
