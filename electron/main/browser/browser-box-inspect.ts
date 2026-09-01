// ---------------------------------------------------------------------------
// Box-model inspect overlay - injectable script for a Lens guest page.
//
// Renders a Figma/DevTools-style box-model overlay (content / padding / border
// / margin rings) for the element under the cursor, plus a measurement mode:
// click an element to "pin" it, then hover another element to see the pixel
// gap between them.
//
// The script is idempotent (re-injecting tears down the previous instance) and
// exposes window.__staveTeardownInspect() so the main process can stop it.
// ---------------------------------------------------------------------------

import { getLensBoxModelScript } from "./browser-style-capture";

export function getBoxInspectScript(): string {
  return `
(function staveBoxInspect() {
  if (typeof window.__staveTeardownInspect === "function") {
    try { window.__staveTeardownInspect(); } catch (_) { /* ignore */ }
  }

  ${getLensBoxModelScript()}

  const RING_Z = "2147483645";
  const PIN_Z = "2147483646";
  const TIP_Z = "2147483647";
  const root = document.body || document.documentElement;

  // -- Box-model ring layers (drawn as CSS borders so each band is clean) ----
  function makeFrame(color) {
    const node = document.createElement("div");
    Object.assign(node.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: RING_Z,
      boxSizing: "content-box",
      borderStyle: "solid",
      borderColor: color,
      borderWidth: "0",
      background: "transparent",
      top: "0", left: "0", width: "0", height: "0",
      display: "none",
    });
    root.appendChild(node);
    return node;
  }

  const marginFrame = makeFrame("rgba(246, 178, 107, 0.65)");
  const borderFrame = makeFrame("rgba(253, 216, 53, 0.65)");
  const paddingFrame = makeFrame("rgba(147, 196, 125, 0.65)");

  const contentFill = document.createElement("div");
  Object.assign(contentFill.style, {
    position: "fixed", pointerEvents: "none", zIndex: RING_Z,
    background: "rgba(111, 168, 220, 0.30)",
    top: "0", left: "0", width: "0", height: "0", display: "none",
  });
  root.appendChild(contentFill);

  const pinFrame = document.createElement("div");
  Object.assign(pinFrame.style, {
    position: "fixed", pointerEvents: "none", zIndex: PIN_Z,
    border: "2px solid #f43f5e", background: "rgba(244, 63, 94, 0.08)",
    boxSizing: "border-box",
    top: "0", left: "0", width: "0", height: "0", display: "none",
  });
  root.appendChild(pinFrame);

  const tip = document.createElement("div");
  Object.assign(tip.style, {
    position: "fixed", pointerEvents: "none", zIndex: TIP_Z,
    background: "#0f172a", color: "#f8fafc",
    font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "6px 8px", borderRadius: "6px", whiteSpace: "pre",
    boxShadow: "0 6px 20px rgba(0,0,0,0.35)", maxWidth: "360px",
    overflow: "hidden", textOverflow: "ellipsis", display: "none",
  });
  root.appendChild(tip);

  const measureNodes = [];
  let pinned = null;

  function clearMeasure() {
    for (let i = 0; i < measureNodes.length; i += 1) {
      try { measureNodes[i].remove(); } catch (_) { /* ignore */ }
    }
    measureNodes.length = 0;
  }

  function makeMeasureLine(x, y, w, h) {
    const node = document.createElement("div");
    Object.assign(node.style, {
      position: "fixed", pointerEvents: "none", zIndex: PIN_Z,
      background: "#f43f5e",
      left: x + "px", top: y + "px",
      width: Math.max(1, w) + "px", height: Math.max(1, h) + "px",
    });
    root.appendChild(node);
    measureNodes.push(node);
  }

  function makeMeasureLabel(text, cx, cy) {
    const node = document.createElement("div");
    Object.assign(node.style, {
      position: "fixed", pointerEvents: "none", zIndex: TIP_Z,
      background: "#f43f5e", color: "#fff",
      font: "10px/1 ui-monospace, monospace",
      padding: "2px 4px", borderRadius: "3px", whiteSpace: "nowrap",
      transform: "translate(-50%, -50%)",
      left: cx + "px", top: cy + "px",
    });
    node.textContent = text;
    root.appendChild(node);
    measureNodes.push(node);
  }

  function frame(node, left, top, w, h, t, r, b, l) {
    const tt = Math.max(0, t), rr = Math.max(0, r);
    const bb = Math.max(0, b), ll = Math.max(0, l);
    if (!tt && !rr && !bb && !ll) {
      node.style.display = "none";
      return;
    }
    node.style.display = "block";
    node.style.left = left + "px";
    node.style.top = top + "px";
    node.style.width = Math.max(0, w) + "px";
    node.style.height = Math.max(0, h) + "px";
    node.style.borderTopWidth = tt + "px";
    node.style.borderRightWidth = rr + "px";
    node.style.borderBottomWidth = bb + "px";
    node.style.borderLeftWidth = ll + "px";
  }

  function hideRings() {
    marginFrame.style.display = "none";
    borderFrame.style.display = "none";
    paddingFrame.style.display = "none";
    contentFill.style.display = "none";
  }

  function isOwnNode(el) {
    return (
      el === tip || el === marginFrame || el === borderFrame ||
      el === paddingFrame || el === contentFill || el === pinFrame ||
      measureNodes.indexOf(el) !== -1
    );
  }

  function fmtEdges(edges) {
    const round = function (n) { return Math.round(n * 100) / 100; };
    const t = round(edges.top), r = round(edges.right);
    const b = round(edges.bottom), l = round(edges.left);
    if (t === r && r === b && b === l) return t + "";
    return t + " / " + r + " / " + b + " / " + l;
  }

  function updateTooltip(clientX, clientY, model) {
    const cls = model.classList.length
      ? "." + model.classList.slice(0, 3).join(".")
      : "";
    const head = model.tagName + (model.id ? "#" + model.id : "") + cls;
    const lines = [
      head,
      "size    " + Math.round(model.content.width) + " x " + Math.round(model.content.height),
      "padding " + fmtEdges(model.padding),
      "border  " + fmtEdges(model.border),
      "margin  " + fmtEdges(model.margin),
    ];
    tip.textContent = lines.join("\\n");
    tip.style.display = "block";

    const pad = 12;
    const rect = tip.getBoundingClientRect();
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + rect.width + 4 > window.innerWidth) x = clientX - rect.width - pad;
    if (y + rect.height + 4 > window.innerHeight) y = clientY - rect.height - pad;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }

  function renderRings(el) {
    const model = staveBoxModelForElement(el);
    if (!model) { hideRings(); return null; }
    const rect = el.getBoundingClientRect();
    const bl = model.border.left, br = model.border.right;
    const bt = model.border.top, bb = model.border.bottom;
    const pl = model.padding.left, pr = model.padding.right;
    const pt = model.padding.top, pb = model.padding.bottom;
    const ml = model.margin.left, mr = model.margin.right;
    const mt = model.margin.top, mb = model.margin.bottom;

    // margin ring: content box == border-box rect, borders == margins.
    frame(marginFrame, rect.left - ml, rect.top - mt, rect.width, rect.height, mt, mr, mb, ml);

    // border ring: content box == padding box, borders == border widths.
    const pw = rect.width - bl - br;
    const ph = rect.height - bt - bb;
    frame(borderFrame, rect.left, rect.top, pw, ph, bt, br, bb, bl);

    // padding ring: content box == content box, borders == paddings.
    const cw = pw - pl - pr;
    const ch = ph - pt - pb;
    const px = rect.left + bl, py = rect.top + bt;
    frame(paddingFrame, px, py, cw, ch, pt, pr, pb, pl);

    // content fill.
    const cx = px + pl, cy = py + pt;
    contentFill.style.display = "block";
    contentFill.style.left = cx + "px";
    contentFill.style.top = cy + "px";
    contentFill.style.width = Math.max(0, cw) + "px";
    contentFill.style.height = Math.max(0, ch) + "px";

    return { model: model, rect: rect };
  }

  function renderMeasure(a, b) {
    clearMeasure();
    const m = staveMeasureRects(a, b);
    if (m.horizontal > 0.5) {
      let lx, rx;
      if (b.left >= a.right) { lx = a.right; rx = b.left; }
      else { lx = b.right; rx = a.left; }
      const y = Math.round((Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2) ||
        Math.round((a.top + a.bottom) / 2);
      makeMeasureLine(lx, y, rx - lx, 1);
      makeMeasureLabel(Math.round(m.horizontal) + "px", (lx + rx) / 2, y - 9);
    }
    if (m.vertical > 0.5) {
      let ty, by;
      if (b.top >= a.bottom) { ty = a.bottom; by = b.top; }
      else { ty = b.bottom; by = a.top; }
      const x = Math.round((Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2) ||
        Math.round((a.left + a.right) / 2);
      makeMeasureLine(x, ty, 1, by - ty);
      makeMeasureLabel(Math.round(m.vertical) + "px", x + 14, (ty + by) / 2);
    }
  }

  function onMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwnNode(el)) return;
    const info = renderRings(el);
    if (!info) return;
    updateTooltip(e.clientX, e.clientY, info.model);
    if (pinned && pinned !== el && pinned.isConnected) {
      renderMeasure(pinned.getBoundingClientRect(), info.rect);
    } else {
      clearMeasure();
    }
  }

  function onClick(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwnNode(el)) return;
    e.preventDefault();
    e.stopPropagation();
    if (pinned === el) {
      pinned = null;
      pinFrame.style.display = "none";
      clearMeasure();
      return;
    }
    pinned = el;
    const r = el.getBoundingClientRect();
    pinFrame.style.display = "block";
    pinFrame.style.left = r.left + "px";
    pinFrame.style.top = r.top + "px";
    pinFrame.style.width = r.width + "px";
    pinFrame.style.height = r.height + "px";
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    if (pinned) {
      pinned = null;
      pinFrame.style.display = "none";
      clearMeasure();
    }
  }

  function onScroll() {
    hideRings();
    tip.style.display = "none";
    clearMeasure();
    if (pinned && pinned.isConnected) {
      const r = pinned.getBoundingClientRect();
      pinFrame.style.left = r.left + "px";
      pinFrame.style.top = r.top + "px";
      pinFrame.style.width = r.width + "px";
      pinFrame.style.height = r.height + "px";
    }
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);

  window.__staveInspectActive = true;
  window.__staveTeardownInspect = function () {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    clearMeasure();
    const nodes = [marginFrame, borderFrame, paddingFrame, contentFill, pinFrame, tip];
    for (let i = 0; i < nodes.length; i += 1) {
      try { nodes[i].remove(); } catch (_) { /* ignore */ }
    }
    pinned = null;
    window.__staveInspectActive = false;
    delete window.__staveTeardownInspect;
  };
})();
true
`;
}
