/**
 * The rendered view of an `.html` file open in the editor.
 *
 * A workspace file may come from anywhere (a cloned repository, an agent), so
 * it gets the same isolation as an inline render: a sandboxed frame without
 * `allow-same-origin`, so the page runs with an opaque origin and cannot reach
 * Stave, its storage, or the preload bridge. Network access matches opening
 * the file in a browser (`open`), since the user chose to view this file.
 *
 * The page is shown as written: no padding, theme, or bootstrap of the
 * inline render frame. Only a `<meta>` CSP and a small frame script (link
 * guard, save shortcut) go ahead of the page's own markup.
 */

import {
  INLINE_RENDER_FRAME_SANDBOX,
  buildInlineRenderCsp,
} from "@/lib/inline-render/inline-render";

/** Never `allow-same-origin`, `allow-popups`, or `allow-modals`. */
export const HTML_FILE_PREVIEW_FRAME_SANDBOX = INLINE_RENDER_FRAME_SANDBOX;

export const HTML_FILE_PREVIEW_CSP = buildInlineRenderCsp("open", {
  delivery: "meta",
});

/** The message type the frame posts for Cmd/Ctrl+S. */
export const HTML_FILE_PREVIEW_SAVE_MESSAGE = "stave:html-file-preview:save";

/** Whether `data` is the frame's save request. */
export function isHtmlFilePreviewSaveMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === HTML_FILE_PREVIEW_SAVE_MESSAGE
  );
}

/**
 * A srcdoc document resolves links against the app's own URL, so following
 * any link (even `#section`) would load another page, or the app itself, in
 * the preview. Two click listeners keep the preview on the file:
 *
 * - A link that leaves the page is cancelled in the capture phase on
 *   `window`, ahead of every page handler, so a handler that stops
 *   propagation cannot let it through. Script navigations (`location.href`,
 *   a meta refresh) cannot be caught here; the main process refuses those.
 * - An in-page `#fragment` link is handled after the page's own handlers,
 *   unless one of them already cancelled the click (a tab widget on
 *   `href="#"`). It moves within the srcdoc document through `location.hash`,
 *   so the browser scrolls and `hashchange` fires as it would in a tab.
 *
 * Key events stay inside the frame, so the save shortcut is passed up as the
 * one message the frame sends (`HTML_FILE_PREVIEW_SAVE_MESSAGE`). The host
 * honours it only while the frame holds focus in a focused window, so a page
 * script cannot save the tab while the user is working elsewhere.
 */
const FRAME_SCRIPT = [
  "(function(){",
  'window.addEventListener("keydown",function(e){',
  'if(!(e.metaKey||e.ctrlKey)||(e.key||"").toLowerCase()!=="s")return;',
  "e.preventDefault();",
  `parent.postMessage({type:${JSON.stringify(HTML_FILE_PREVIEW_SAVE_MESSAGE)}},"*");`,
  "},true);",
  'function link(e){var t=e.target;return t&&t.closest?t.closest("a[href],area[href]"):null}',
  'function fragment(a){var h=a.getAttribute("href")||"";return h.charAt(0)==="#"?h:null}',
  'window.addEventListener("click",function(e){var a=link(e);if(a&&fragment(a)===null)e.preventDefault()},true);',
  'window.addEventListener("click",function(e){',
  "if(e.defaultPrevented)return;",
  "var a=link(e);var h=a?fragment(a):null;if(h===null)return;",
  "e.preventDefault();",
  'var i=location.href.indexOf("#");',
  "if((i<0?null:location.href.slice(i))!==h){location.hash=h.slice(1);return}",
  "var id=h.slice(1);try{id=decodeURIComponent(id)}catch(_){}",
  "var el=id?document.getElementById(id)||document.getElementsByName(id)[0]:null;",
  'if(el)el.scrollIntoView();else if(!id||id.toLowerCase()==="top")window.scrollTo(0,0);',
  "});",
  "})();",
].join("");

const LEADING_DOCTYPE_PATTERN = /^\uFEFF?\s*<!doctype[^>]*>/i;

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * The srcdoc for one HTML file. The CSP and guard go right after the doctype,
 * ahead of every script the page declares; a page without a doctype keeps
 * rendering in quirks mode, as it would in a browser.
 */
export function buildHtmlFilePreviewDocument(html: string, networkPolicy: "open" | "blocked" = "open"): string {
  const doctypeMatch = LEADING_DOCTYPE_PATTERN.exec(html);
  const doctype = doctypeMatch
    ? doctypeMatch[0].replace(/^\uFEFF?\s*/, "")
    : "";
  const rest = doctypeMatch
    ? html.slice(doctypeMatch[0].length)
    : html.replace(/^\uFEFF/, "");
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(networkPolicy === "blocked" ? buildInlineRenderCsp("blocked", { delivery: "meta", embeddedScripts: true }) : HTML_FILE_PREVIEW_CSP)}">`,
    `<script>${FRAME_SCRIPT}</script>`,
  ].join("");
  return `${doctype}${head}${rest}`;
}
