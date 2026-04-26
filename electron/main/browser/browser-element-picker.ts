// ---------------------------------------------------------------------------
// Element picker – injectable script for WebContentsView
// Returns a stringified JS to inject via webContents.executeJavaScript().
// The script creates an overlay, highlights on hover, and resolves with
// element info on click.
// ---------------------------------------------------------------------------

interface ElementPickerOptions {
  /** When true, attempt to extract React fiber _debugSource info. */
  extractDebugSource?: boolean;
}

/**
 * Returns JS source that, when evaluated in a browsing context, opens an
 * element picker and resolves with an {@link ElementPickerResult}-shaped object.
 */
export function getElementPickerScript(
  options: ElementPickerOptions = {},
): string {
  const extractDebugSource = options.extractDebugSource ?? false;

  return `
(function staveElementPicker() {
  return new Promise((resolve) => {
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

    /** Build a stable CSS selector for the element, preferring attributes that
     *  survive re-renders over positional nth-child indices. */
    function buildSelector(el) {
      // 1. Unique ID — most stable anchor
      if (el.id) return "#" + CSS.escape(el.id);

      // 2. Stable test/automation attributes
      const stableAttrs = ["data-testid", "data-cy", "data-test", "data-id", "aria-label"];
      for (const attr of stableAttrs) {
        const val = el.getAttribute(attr);
        if (val) return el.tagName.toLowerCase() + "[" + attr + "=" + JSON.stringify(val) + "]";
      }

      // 3. Walk up the tree building a path. Use :nth-of-type (stable within
      //    same-tag siblings) instead of :nth-child (shifts when other tags
      //    are inserted by dynamic rendering).
      const parts = [];
      let cur = el;
      while (cur && cur !== document.documentElement && parts.length < 8) {
        if (cur.id) { parts.unshift("#" + CSS.escape(cur.id)); break; }
        let seg = cur.tagName.toLowerCase();
        const parent = cur.parentElement;
        if (parent) {
          const sameTagSiblings = Array.from(parent.children).filter(
            (c) => c.tagName === cur.tagName
          );
          if (sameTagSiblings.length > 1) {
            seg += ":nth-of-type(" + (sameTagSiblings.indexOf(cur) + 1) + ")";
          }
        }
        parts.unshift(seg);
        cur = parent;
      }
      return parts.join(" > ");
    }

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
      cleanup();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) { resolve(null); return; }

      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const styleKeys = [
        "color", "backgroundColor", "fontSize", "fontWeight",
        "padding", "margin", "display", "position",
        "width", "height", "borderRadius", "opacity",
      ];
      const computedStyles = {};
      for (const k of styleKeys) computedStyles[k] = cs.getPropertyValue(
        k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())
      );

      // Attempt React fiber _debugSource extraction
      let debugSource = null;
      ${extractDebugSource ? `
      try {
        const fiberKey = Object.keys(el).find(function(k) {
          return k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$");
        });
        if (fiberKey) {
          let fiber = el[fiberKey];
          for (let i = 0; i < 10 && fiber; i++) {
            if (fiber._debugSource) {
              debugSource = {
                fileName: fiber._debugSource.fileName,
                lineNumber: fiber._debugSource.lineNumber,
                columnNumber: fiber._debugSource.columnNumber,
              };
              break;
            }
            fiber = fiber.return;
          }
        }
      } catch (_) {
        // Silently ignore — _debugSource extraction is best-effort
      }
      ` : "// _debugSource extraction disabled by settings"}

      resolve({
        selector: buildSelector(el),
        tagName: el.tagName.toLowerCase(),
        id: el.id || "",
        classList: Array.from(el.classList),
        boundingBox: {
          x: Math.round(r.x), y: Math.round(r.y),
          width: Math.round(r.width), height: Math.round(r.height),
        },
        computedStyles,
        outerHTML: el.outerHTML.slice(0, 2000),
        textContent: (el.textContent || "").trim().slice(0, 500),
        debugSource,
      });
    }

    function onKeyDown(e) {
      if (e.key === "Escape") { cleanup(); resolve(null); }
    }

    function cleanup() {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      label.remove();
    }

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  });
})()
`;
}
