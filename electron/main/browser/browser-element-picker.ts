// ---------------------------------------------------------------------------
// Element picker – injectable script for a Lens guest page
// Returns a stringified JS to inject via webContents.executeJavaScript().
// The script creates an overlay, highlights on hover, and resolves with
// element info on click.
// ---------------------------------------------------------------------------

import { getLensStyleCaptureScript } from "./browser-style-capture";
import { getLensElementContextScript } from "./browser-element-context";

interface ElementPickerOptions {
  /** When true, attempt to extract React fiber _debugSource info. */
  extractDebugSource?: boolean;
  /** Main-issued identity for the current top-level document. */
  documentId?: string;
}

/**
 * Returns JS source that, when evaluated in a browsing context, opens an
 * element picker and resolves with an {@link ElementPickerResult}-shaped object.
 */
export function getElementPickerScript(
  options: ElementPickerOptions = {},
): string {
  const extractDebugSource = options.extractDebugSource ?? false;
  const documentId = JSON.stringify(options.documentId ?? "");

  return `
(function staveElementPicker() {
  if (typeof window.__staveTeardownElementPicker === "function") {
    try { window.__staveTeardownElementPicker(); } catch (_) { /* ignore */ }
  }

  const documentId = ${documentId};
  ${getLensElementContextScript()}

  return new Promise((resolve) => {
    const PICKER_TIMEOUT_MS = 45000;
    let done = false;
    let timeoutId = 0;

    // Overlay for highlight — attach to body, not documentElement, to avoid
    // breaking layouts that expect documentElement to have no extra children.
    const overlay = document.createElement("div");
    overlay.id = "__stave_picker_overlay";
    Object.assign(overlay.style, {
      position: "fixed", pointerEvents: "none", zIndex: "2147483647",
      border: "2px solid #3b82f6", background: "rgba(59,130,246,0.12)",
      borderRadius: "3px", transition: "all 80ms ease",
      top: "0", left: "0", width: "0", height: "0",
    });
    (document.body || document.documentElement).appendChild(overlay);

    // Label
    const label = document.createElement("div");
    Object.assign(label.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none",
      background: "#1e293b", color: "#f8fafc", fontSize: "11px",
      fontFamily: "monospace", padding: "2px 6px", borderRadius: "3px",
      whiteSpace: "nowrap", top: "0", left: "0", display: "none",
    });
    (document.body || document.documentElement).appendChild(label);

    function onMouseMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === overlay || el === label) return;
      const r = el.getBoundingClientRect();
      Object.assign(overlay.style, {
        top: r.top + "px", left: r.left + "px",
        width: r.width + "px", height: r.height + "px",
      });
      const tag = el.tagName.toLowerCase();
      const id = el.id ? "#" + el.id : "";
      const cls = el.classList.length ? "." + Array.from(el.classList).join(".") : "";
      label.textContent = tag + id + cls + "  " + Math.round(r.width) + "x" + Math.round(r.height);
      label.style.display = "block";
      label.style.top = Math.max(0, r.top - 22) + "px";
      label.style.left = r.left + "px";
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) { finish(null); return; }

      const r = el.getBoundingClientRect();
      ${getLensStyleCaptureScript()}
      const computedStyles = staveComputedStylesForElement(el);
      const anchor = staveElementContext(el, ${String(extractDebugSource)});
      anchor.computedStyles = computedStyles;

      finish({
        selector: anchor.selector,
        tagName: anchor.element.tagName,
        id: anchor.element.id,
        classList: anchor.element.classList,
        boundingBox: staveRectToPlain(r),
        computedStyles,
        outerHTML: anchor.outerHTML,
        textContent: anchor.textContent,
        debugSource: anchor.debugSource,
        componentNameChain: anchor.componentNameChain,
        page: stavePageIdentity(documentId),
        anchor,
        trust: "untrusted-page-evidence",
      });
    }

    function onKeyDown(e) {
      if (e.key === "Escape") { finish(null); }
    }

    function cleanup() {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = 0;
      }
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      label.remove();
      if (window.__staveTeardownElementPicker === teardown) {
        delete window.__staveTeardownElementPicker;
      }
    }

    function finish(result) {
      if (done) return;
      done = true;
      cleanup();
      resolve(result);
    }

    function teardown() {
      finish(null);
    }

    window.__staveTeardownElementPicker = teardown;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    timeoutId = window.setTimeout(function() {
      finish(null);
    }, PICKER_TIMEOUT_MS);
  });
})()
`;
}
