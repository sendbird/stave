/** Shared by injected tools; never dispatches an action into the page. */
export function getLensPointerScript(): string {
  return `
  function staveElementAtPoint(x, y, parent = false) {
    // Keep closed/open shadow hosts as the boundary until capture selectors
    // can identify a shadow-root path. A document selector for a shadow child
    // could otherwise target an unrelated element in the outer document.
    const element = document.elementFromPoint(x, y);
    return parent && element?.parentElement && element.parentElement !== document.documentElement
      ? element.parentElement : element;
  }

  function stavePointerTracker(render) {
    let frame = 0;
    let point = null;
    function refresh() {
      if (!point || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render(point);
      });
    }
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return {
      move(event) {
        point = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey };
        refresh();
      },
      dispose() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        point = null;
        window.removeEventListener("scroll", refresh, true);
        window.removeEventListener("resize", refresh);
      },
    };
  }

  function stavePositionLabel(label, rect) {
    label.style.maxWidth = Math.max(0, window.innerWidth - 8) + "px";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    const size = label.getBoundingClientRect();
    label.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - size.width - 4)) + "px";
    label.style.top = Math.max(4, Math.min(rect.top >= size.height + 6 ? rect.top - size.height - 4 : rect.bottom + 4,
      window.innerHeight - size.height - 4)) + "px";
  }
  `;
}
