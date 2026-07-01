import { getLensStyleCaptureScript } from "./browser-style-capture";
import type { LensAnnotation } from "../../../src/lib/lens/lens.types";

interface AnnotationOverlayOptions {
  extractDebugSource?: boolean;
  initialAnnotations?: LensAnnotation[];
  nonce: string;
}

export function getAnnotationOverlayScript(
  options: AnnotationOverlayOptions,
): string {
  const extractDebugSource = options.extractDebugSource ?? false;
  const initialAnnotations = JSON.stringify(options.initialAnnotations ?? []);
  const nonce = JSON.stringify(options.nonce);

  return `
(function staveAnnotationOverlay() {
  const nonce = ${nonce};
  const initialAnnotations = ${initialAnnotations};
  const BEACON_PREFIX = "__STAVE_ANN__" + nonce;
  if (window.__staveTeardownAnnotations) {
    window.__staveTeardownAnnotations();
  }

  const root = document.createElement("div");
  root.id = "__stave_annotation_overlay";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    pointerEvents: "none",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  });

  const hover = document.createElement("div");
  Object.assign(hover.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px solid #22c55e",
    background: "rgba(34,197,94,0.12)",
    borderRadius: "3px",
    transition: "all 70ms ease",
    display: "none",
  });
  root.appendChild(hover);

  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "fixed",
    pointerEvents: "none",
    background: "#052e16",
    color: "#f0fdf4",
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "2px 6px",
    borderRadius: "3px",
    whiteSpace: "nowrap",
    display: "none",
  });
  root.appendChild(label);

  const areaBox = document.createElement("div");
  Object.assign(areaBox.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px dashed #f59e0b",
    background: "rgba(245,158,11,0.12)",
    display: "none",
  });
  root.appendChild(areaBox);

  const pinLayer = document.createElement("div");
  Object.assign(pinLayer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
  });
  root.appendChild(pinLayer);
  (document.body || document.documentElement).appendChild(root);

  const annotations = new Map();
  const pins = new Map();
  let nextPin = 1;
  let hoverElement = null;
  let pendingInput = null;
  let dragStart = null;
  let captureActive = true;

  function rectToPlain(r) {
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  function emit(type, annotation) {
    const payload = { type };
    if (annotation) payload.annotation = annotation;
    if (type === "submit") payload.annotations = Array.from(annotations.values());
    console.debug(BEACON_PREFIX + JSON.stringify(payload));
  }

  function buildSelector(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const stableAttrs = ["data-testid", "data-cy", "data-test", "data-id", "aria-label"];
    for (const attr of stableAttrs) {
      const val = el.getAttribute(attr);
      if (val) return el.tagName.toLowerCase() + "[" + attr + "=" + JSON.stringify(val) + "]";
    }
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement && parts.length < 8) {
      if (cur.id) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      let seg = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (candidate) => candidate.tagName === cur.tagName
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

  function getDebugSource(el) {
    ${
      extractDebugSource
        ? `
    try {
      const fiberKey = Object.keys(el).find(function(k) {
        return k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$");
      });
      if (fiberKey) {
        let fiber = el[fiberKey];
        for (let i = 0; i < 10 && fiber; i++) {
          if (fiber._debugSource) {
            return {
              fileName: fiber._debugSource.fileName,
              lineNumber: fiber._debugSource.lineNumber,
              columnNumber: fiber._debugSource.columnNumber,
            };
          }
          fiber = fiber.return;
        }
      }
    } catch (_) {}
    `
        : ""
    }
    return null;
  }

  ${getLensStyleCaptureScript()}

  function makeElementAnnotation(el, comment) {
    const r = el.getBoundingClientRect();
    return {
      id: "ann-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      kind: "element",
      pin: nextPin++,
      rect: rectToPlain(r),
      comment,
      createdAt: new Date().toISOString(),
      selector: buildSelector(el),
      tagName: el.tagName.toLowerCase(),
      elementId: el.id || "",
      classList: Array.from(el.classList),
      computedStyles: staveComputedStylesForElement(el),
      outerHTML: el.outerHTML.slice(0, 2000),
      textContent: (el.textContent || "").trim().slice(0, 500),
      debugSource: getDebugSource(el),
      styleEdits: [],
    };
  }

  function makeAreaAnnotation(rect, comment) {
    return {
      id: "ann-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      kind: "area",
      pin: nextPin++,
      rect,
      comment,
      createdAt: new Date().toISOString(),
      styleEdits: [],
    };
  }

  function createPin(annotation) {
    const wrap = document.createElement("div");
    wrap.dataset.annotationId = annotation.id;
    Object.assign(wrap.style, {
      position: "fixed",
      left: Math.max(4, annotation.rect.x) + "px",
      top: Math.max(4, annotation.rect.y) + "px",
      display: "inline-flex",
      alignItems: "center",
      gap: "2px",
      pointerEvents: "auto",
      transform: "translate(-2px, -18px)",
    });

    const badge = document.createElement("button");
    badge.type = "button";
    badge.textContent = String(annotation.pin);
    badge.title = annotation.comment;
    Object.assign(badge.style, {
      minWidth: "20px",
      height: "20px",
      borderRadius: "999px",
      border: "1px solid rgba(15,23,42,0.35)",
      background: "#22c55e",
      color: "#052e16",
      fontSize: "12px",
      fontWeight: "700",
      cursor: "default",
    });

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Delete annotation";
    Object.assign(del.style, {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      border: "1px solid rgba(15,23,42,0.35)",
      background: "#0f172a",
      color: "#f8fafc",
      fontSize: "12px",
      lineHeight: "16px",
      cursor: "pointer",
    });
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAnnotation(annotation.id);
    });

    wrap.appendChild(badge);
    wrap.appendChild(del);
    pinLayer.appendChild(wrap);
    pins.set(annotation.id, wrap);
  }

  function addAnnotation(annotation) {
    annotations.set(annotation.id, annotation);
    createPin(annotation);
    emit("add", annotation);
  }

  function removeAnnotation(id) {
    const annotation = annotations.get(id);
    if (!annotation) return false;
    annotations.delete(id);
    pins.get(id)?.remove();
    pins.delete(id);
    emit("remove", annotation);
    return true;
  }

  function clearAnnotations() {
    annotations.clear();
    for (const pin of pins.values()) {
      pin.remove();
    }
    pins.clear();
    nextPin = 1;
    clearPendingInput();
    hover.style.display = "none";
    label.style.display = "none";
    areaBox.style.display = "none";
    dragStart = null;
    emit("clear");
    return true;
  }

  function clearPendingInput() {
    pendingInput?.remove();
    pendingInput = null;
  }

  function setInlineStyle(selector, patch) {
    const el = document.querySelector(selector);
    if (!el) return [];
    const allowed = new Set([
      "fontSize",
      "fontWeight",
      "color",
      "backgroundColor",
      "padding",
      "margin",
    ]);
    const computed = window.getComputedStyle(el);
    const edits = [];
    for (const [property, after] of Object.entries(patch || {})) {
      if (!allowed.has(property)) continue;
      const cssProperty = property.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
      const before = computed.getPropertyValue(cssProperty);
      el.style[property] = String(after);
      edits.push({ property, before, after: String(after) });
    }
    return edits;
  }

  function showCommentInput(rect, onSubmit) {
    clearPendingInput();
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Comment";
    Object.assign(input.style, {
      position: "fixed",
      left: Math.min(window.innerWidth - 260, Math.max(8, rect.x)) + "px",
      top: Math.min(window.innerHeight - 36, Math.max(8, rect.y + rect.height + 6)) + "px",
      width: "240px",
      height: "30px",
      zIndex: "2147483647",
      pointerEvents: "auto",
      border: "1px solid #22c55e",
      borderRadius: "6px",
      padding: "0 8px",
      background: "#020617",
      color: "#f8fafc",
      fontSize: "12px",
      outline: "none",
      boxShadow: "0 10px 30px rgba(2,6,23,0.35)",
    });
    pendingInput = input;
    root.appendChild(input);
    input.focus();

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearPendingInput();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const comment = input.value.trim();
        clearPendingInput();
        if (comment) onSubmit(comment);
      }
    });
  }

  function onMouseMove(event) {
    if (!captureActive) return;
    if (pendingInput || dragStart) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || root.contains(el)) return;
    hoverElement = el;
    const r = el.getBoundingClientRect();
    Object.assign(hover.style, {
      top: r.top + "px",
      left: r.left + "px",
      width: r.width + "px",
      height: r.height + "px",
      display: "block",
    });
    label.textContent =
      el.tagName.toLowerCase() + " " + Math.round(r.width) + "x" + Math.round(r.height);
    label.style.display = "block";
    label.style.top = Math.max(0, r.top - 22) + "px";
    label.style.left = r.left + "px";
  }

  function onMouseDown(event) {
    if (!captureActive) return;
    if (!event.shiftKey || root.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    dragStart = { x: event.clientX, y: event.clientY };
    Object.assign(areaBox.style, {
      left: dragStart.x + "px",
      top: dragStart.y + "px",
      width: "0px",
      height: "0px",
      display: "block",
    });
  }

  function onDragMove(event) {
    if (!captureActive) return;
    if (!dragStart) return;
    event.preventDefault();
    const x = Math.min(dragStart.x, event.clientX);
    const y = Math.min(dragStart.y, event.clientY);
    const width = Math.abs(event.clientX - dragStart.x);
    const height = Math.abs(event.clientY - dragStart.y);
    Object.assign(areaBox.style, {
      left: x + "px",
      top: y + "px",
      width: width + "px",
      height: height + "px",
    });
  }

  function onMouseUp(event) {
    if (!captureActive) return;
    if (!dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = {
      x: Math.round(Math.min(dragStart.x, event.clientX)),
      y: Math.round(Math.min(dragStart.y, event.clientY)),
      width: Math.round(Math.abs(event.clientX - dragStart.x)),
      height: Math.round(Math.abs(event.clientY - dragStart.y)),
    };
    dragStart = null;
    areaBox.style.display = "none";
    if (rect.width < 8 || rect.height < 8) return;
    showCommentInput(rect, (comment) => {
      addAnnotation(makeAreaAnnotation(rect, comment));
    });
  }

  function onClick(event) {
    if (!captureActive) return;
    if (root.contains(event.target) || pendingInput || dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const el = hoverElement || document.elementFromPoint(event.clientX, event.clientY);
    if (!el || root.contains(el)) return;
    const rect = rectToPlain(el.getBoundingClientRect());
    showCommentInput(rect, (comment) => {
      addAnnotation(makeElementAnnotation(el, comment));
    });
  }

  function onKeyDown(event) {
    if (!captureActive) return;
    if (event.key === "Escape") {
      clearPendingInput();
    }
  }

  function setCaptureActive(active) {
    captureActive = Boolean(active);
    if (!captureActive) {
      hover.style.display = "none";
      label.style.display = "none";
      areaBox.style.display = "none";
      clearPendingInput();
      dragStart = null;
    }
    return true;
  }

  function setScreenshotCaptureActive(active) {
    const visible = Boolean(active);
    hover.style.display = visible && captureActive && hoverElement ? "block" : "none";
    label.style.display = visible && captureActive && hoverElement ? "block" : "none";
    areaBox.style.display = "none";
    root.style.opacity = visible ? "1" : "0";
    return true;
  }

  function teardown() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("mousemove", onDragMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    root.remove();
    delete window.__staveAnnotations;
    delete window.__staveGetAnnotations;
    delete window.__staveRemoveAnnotation;
    delete window.__staveClearAnnotations;
    delete window.__staveSetStyle;
    delete window.__staveSetAnnotationCaptureActive;
    delete window.__staveSetAnnotationScreenshotCaptureActive;
    delete window.__staveTeardownAnnotations;
  }

  window.__staveAnnotations = annotations;
  window.__staveGetAnnotations = function() {
    return Array.from(annotations.values());
  };
  window.__staveRemoveAnnotation = removeAnnotation;
  window.__staveClearAnnotations = clearAnnotations;
  window.__staveSetStyle = setInlineStyle;
  window.__staveSetAnnotationCaptureActive = setCaptureActive;
  window.__staveSetAnnotationScreenshotCaptureActive = setScreenshotCaptureActive;
  window.__staveTeardownAnnotations = teardown;

  for (const annotation of initialAnnotations) {
    if (!annotation || !annotation.id) continue;
    annotations.set(annotation.id, annotation);
    nextPin = Math.max(nextPin, Number(annotation.pin || 0) + 1);
    createPin(annotation);
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onDragMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  return true;
})()
`;
}
