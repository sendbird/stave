import { getLensStyleCaptureScript } from "./browser-style-capture";
import type { LensAnnotation } from "../../../src/lib/lens/lens.types";
import { getLensElementContextScript } from "./browser-element-context";

interface AnnotationOverlayOptions {
  documentId: string;
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
  const documentId = JSON.stringify(options.documentId);

  return `
(function staveAnnotationOverlay() {
  const nonce = ${nonce};
  const documentId = ${documentId};
  const initialAnnotations = ${initialAnnotations};
  const BEACON_PREFIX = "__STAVE_ANN__" + nonce;
  if (window.__staveTeardownAnnotations) {
    window.__staveTeardownAnnotations();
  }

  const root = document.createElement("div");
  root.id = "__stave_annotation_overlay";
  const shadowRoot = root.attachShadow({ mode: "closed" });
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
  shadowRoot.appendChild(hover);

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
  shadowRoot.appendChild(label);

  const areaBox = document.createElement("div");
  Object.assign(areaBox.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px dashed #f59e0b",
    background: "rgba(245,158,11,0.12)",
    display: "none",
  });
  shadowRoot.appendChild(areaBox);

  const pinLayer = document.createElement("div");
  Object.assign(pinLayer.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
  });
  shadowRoot.appendChild(pinLayer);
  (document.body || document.documentElement).appendChild(root);

  const annotations = new Map();
  const pins = new Map();
  let nextPin = 1;
  let hoverElement = null;
  let pendingInput = null;
  let pendingFocusReturn = null;
  let dragStart = null;
  let captureActive = true;

  ${getLensElementContextScript()}

  function emit(type, annotation) {
    const payload = { type, documentId };
    if (annotation) payload.annotation = annotation;
    if (type === "submit") payload.annotations = Array.from(annotations.values());
    console.debug(BEACON_PREFIX + JSON.stringify(payload));
  }

  function isOverlayNode(node) {
    return node === root || (node instanceof Node && shadowRoot.contains(node));
  }

  function isTrustedOverlayEvent(event) {
    return event.isTrusted && event.composedPath().includes(root);
  }

  ${getLensStyleCaptureScript()}

  function makeReview(anchor, comment, intent, priority, styleEdits) {
    return {
      version: 1,
      page: stavePageIdentity(documentId),
      anchor,
      evidence: {
        screenshot: {
          kind: "clipped",
          bounds: anchor.bounds,
        },
        styleEdits,
      },
      feedback: {
        comment,
        intent,
        priority,
      },
      trust: "untrusted-page-evidence",
    };
  }

  function makeElementAnnotation(el, comment, intent, priority) {
    const anchor = staveElementContext(el, ${String(extractDebugSource)});
    anchor.computedStyles = staveComputedStylesForElement(el);
    const styleEdits = [];
    return {
      id: "ann-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      kind: "element",
      pin: nextPin++,
      rect: anchor.bounds,
      comment,
      createdAt: new Date().toISOString(),
      selector: anchor.selector,
      tagName: anchor.element.tagName,
      elementId: anchor.element.id,
      classList: anchor.element.classList,
      computedStyles: anchor.computedStyles,
      outerHTML: anchor.outerHTML,
      textContent: anchor.textContent,
      debugSource: anchor.debugSource,
      componentNameChain: anchor.componentNameChain,
      styleEdits,
      intent,
      priority,
      review: makeReview(anchor, comment, intent, priority, styleEdits),
    };
  }

  function makeAreaAnnotation(rect, comment, intent, priority) {
    const anchor = staveAreaContext(rect, root);
    const styleEdits = [];
    return {
      id: "ann-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      kind: "area",
      pin: nextPin++,
      rect,
      comment,
      createdAt: new Date().toISOString(),
      styleEdits,
      intent,
      priority,
      review: makeReview(anchor, comment, intent, priority, styleEdits),
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

    const badge = document.createElement("span");
    badge.textContent = String(annotation.pin);
    badge.title = annotation.comment;
    Object.assign(badge.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
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
    del.setAttribute(
      "aria-label",
      "Delete visual comment " + String(annotation.pin),
    );
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
      if (!isTrustedOverlayEvent(event)) return;
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

  function replaceAnnotation(annotation) {
    annotations.set(annotation.id, annotation);
    pins.get(annotation.id)?.remove();
    pins.delete(annotation.id);
    createPin(annotation);
    emit("update", annotation);
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

  function reconcileAnnotations() {
    const page = stavePageIdentity(documentId);
    for (const annotation of Array.from(annotations.values())) {
      const feedback = annotation.review?.feedback || {
        comment: annotation.comment,
        intent: annotation.intent || "fix",
        priority: annotation.priority || "medium",
      };
      const styleEdits =
        annotation.review?.evidence?.styleEdits || annotation.styleEdits || [];

      if (annotation.kind === "area") {
        const previousPage = annotation.review?.page;
        const sameScroll =
          previousPage &&
          previousPage.scroll.x === page.scroll.x &&
          previousPage.scroll.y === page.scroll.y;
        const rect = annotation.rect;
        const intersectsViewport =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x < page.viewport.width &&
          rect.y < page.viewport.height &&
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 0;
        if (!sameScroll || !intersectsViewport) {
          removeAnnotation(annotation.id);
          continue;
        }
        const anchor = staveAreaContext(rect, root);
        replaceAnnotation({
          ...annotation,
          review: {
            version: 1,
            page,
            anchor,
            evidence: {
              screenshot: annotation.review?.evidence?.screenshot || {
                kind: "clipped",
                bounds: rect,
              },
              styleEdits,
            },
            feedback,
            trust: "untrusted-page-evidence",
          },
        });
        continue;
      }

      let element = null;
      try {
        element = annotation.selector
          ? document.querySelector(annotation.selector)
          : null;
      } catch (_) {
        element = null;
      }
      if (!element || isOverlayNode(element)) {
        removeAnnotation(annotation.id);
        continue;
      }

      const anchor = staveElementContext(
        element,
        ${String(extractDebugSource)},
      );
      anchor.computedStyles = staveComputedStylesForElement(element);
      replaceAnnotation({
        ...annotation,
        rect: anchor.bounds,
        selector: anchor.selector,
        tagName: anchor.element.tagName,
        elementId: anchor.element.id,
        classList: anchor.element.classList,
        computedStyles: anchor.computedStyles,
        outerHTML: anchor.outerHTML,
        textContent: anchor.textContent,
        debugSource: anchor.debugSource,
        componentNameChain: anchor.componentNameChain,
        review: {
          version: 1,
          page,
          anchor,
          evidence: {
            screenshot: annotation.review?.evidence?.screenshot || {
              kind: "clipped",
              bounds: anchor.bounds,
            },
            styleEdits,
          },
          feedback,
          trust: "untrusted-page-evidence",
        },
      });
    }
    return Array.from(annotations.values());
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
    const focusReturn = pendingFocusReturn;
    pendingInput?.remove();
    pendingInput = null;
    pendingFocusReturn = null;
    if (
      focusReturn instanceof HTMLElement &&
      focusReturn.isConnected
    ) {
      focusReturn.focus({ preventScroll: true });
    }
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

  function showCommentInput(rect, onSubmit, focusReturn) {
    clearPendingInput();
    pendingFocusReturn =
      focusReturn instanceof HTMLElement ? focusReturn : null;
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Add visual comment");
    Object.assign(panel.style, {
      position: "fixed",
      left: Math.min(window.innerWidth - 292, Math.max(8, rect.x)) + "px",
      top:
        Math.min(
          window.innerHeight - 108,
          Math.max(8, rect.y + rect.height + 6),
        ) + "px",
      width: "280px",
      zIndex: "2147483647",
      pointerEvents: "auto",
      display: "grid",
      gap: "6px",
      padding: "8px",
      border: "1px solid #22c55e",
      borderRadius: "7px",
      background: "#020617",
      color: "#f8fafc",
      boxShadow: "0 10px 30px rgba(2,6,23,0.35)",
    });

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 2048;
    input.placeholder = "Comment";
    input.setAttribute("aria-label", "Visual comment");
    Object.assign(input.style, {
      width: "100%",
      height: "30px",
      border: "1px solid #334155",
      borderRadius: "5px",
      padding: "0 8px",
      background: "#0f172a",
      color: "#f8fafc",
      fontSize: "12px",
    });

    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr auto",
      gap: "6px",
    });

    function createSelect(label, options, selectedValue) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", label);
      Object.assign(select.style, {
        minWidth: "0",
        height: "28px",
        border: "1px solid #334155",
        borderRadius: "5px",
        padding: "0 6px",
        background: "#0f172a",
        color: "#e2e8f0",
        fontSize: "11px",
      });
      for (const [value, optionLabel] of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = optionLabel;
        option.selected = value === selectedValue;
        select.appendChild(option);
      }
      return select;
    }

    const intent = createSelect(
      "Visual comment intent",
      [
        ["fix", "Fix"],
        ["change", "Change"],
        ["question", "Question"],
        ["approve", "Approve"],
      ],
      "fix",
    );
    const priority = createSelect(
      "Visual comment priority",
      [
        ["low", "Low"],
        ["medium", "Medium"],
        ["high", "High"],
      ],
      "medium",
    );
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add";
    add.setAttribute("aria-label", "Add visual comment");
    Object.assign(add.style, {
      height: "28px",
      border: "1px solid #16a34a",
      borderRadius: "5px",
      padding: "0 10px",
      background: "#22c55e",
      color: "#052e16",
      fontSize: "11px",
      fontWeight: "700",
      cursor: "pointer",
    });

    let trustedComment = "";
    let trustedIntent = "fix";
    let trustedPriority = "medium";

    input.addEventListener("input", (event) => {
      if (event.isTrusted) {
        trustedComment = input.value;
      }
    });
    intent.addEventListener("change", (event) => {
      if (event.isTrusted) {
        trustedIntent = intent.value;
      }
    });
    priority.addEventListener("change", (event) => {
      if (event.isTrusted) {
        trustedPriority = priority.value;
      }
    });

    function submitComment(event) {
      if (event && !event.isTrusted) return;
      const comment = trustedComment.trim();
      if (!comment) {
        input.focus();
        return;
      }
      clearPendingInput();
      onSubmit(comment, trustedIntent, trustedPriority);
    }

    input.addEventListener("keydown", (event) => {
      if (!event.isTrusted) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearPendingInput();
      } else if (event.key === "Enter") {
        event.preventDefault();
        submitComment(event);
      }
    });
    add.addEventListener("click", submitComment);

    controls.appendChild(intent);
    controls.appendChild(priority);
    controls.appendChild(add);
    panel.appendChild(input);
    panel.appendChild(controls);
    pendingInput = panel;
    shadowRoot.appendChild(panel);
    input.focus();
  }

  function onMouseMove(event) {
    if (!event.isTrusted) return;
    if (!captureActive) return;
    if (pendingInput || dragStart) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || isOverlayNode(el)) return;
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
    if (!event.isTrusted) return;
    if (!captureActive) return;
    if (!event.shiftKey || isOverlayNode(event.target)) return;
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
    if (!event.isTrusted) return;
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
    if (!event.isTrusted) return;
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
    showCommentInput(
      rect,
      (comment, intent, priority) => {
        addAnnotation(makeAreaAnnotation(rect, comment, intent, priority));
      },
      document.activeElement,
    );
  }

  function onClick(event) {
    if (!event.isTrusted) return;
    if (!captureActive) return;
    if (isOverlayNode(event.target) || pendingInput || dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const el = hoverElement || document.elementFromPoint(event.clientX, event.clientY);
    if (!el || isOverlayNode(el)) return;
    const rect = staveRectToPlain(el.getBoundingClientRect());
    showCommentInput(
      rect,
      (comment, intent, priority) => {
        addAnnotation(makeElementAnnotation(el, comment, intent, priority));
      },
      el,
    );
  }

  function onKeyDown(event) {
    if (!event.isTrusted) return;
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
    delete window.__staveReconcileAnnotations;
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
  window.__staveReconcileAnnotations = reconcileAnnotations;
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
