// ---------------------------------------------------------------------------
// Shared Lens style capture helpers for scripts injected into WebContentsView.
// ---------------------------------------------------------------------------

export const LENS_CAPTURED_STYLE_KEYS = [
  "color",
  "backgroundColor",
  "backgroundImage",
  "fontSize",
  "fontWeight",
  "padding",
  "margin",
  "display",
  "position",
  "width",
  "height",
  "borderRadius",
  "opacity",
] as const;

export function getLensStyleCaptureScript(): string {
  return `
  const STAVE_LENS_STYLE_KEYS = ${JSON.stringify(LENS_CAPTURED_STYLE_KEYS)};

  function parseStaveCssNumericComponent(raw, scale) {
    const value = String(raw || "").trim();
    if (!value) return null;
    if (value.endsWith("%")) {
      const parsed = Number.parseFloat(value.slice(0, -1));
      return Number.isFinite(parsed) ? (parsed / 100) * scale : null;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseStaveCssAlpha(raw) {
    if (raw == null || raw === "") return 1;
    const parsed = parseStaveCssNumericComponent(raw, 1);
    if (parsed == null) return null;
    return Math.max(0, Math.min(1, parsed));
  }

  function parseStaveCssColor(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "transparent") {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    const rgbMatch = normalized.match(/^rgba?\\((.*)\\)$/);
    if (rgbMatch) {
      const body = rgbMatch[1].replace(/\\s*\\/\\s*/, " ");
      const parts = body.includes(",")
        ? body.split(",").map((part) => part.trim())
        : body.trim().split(/\\s+/);
      if (parts.length < 3) return null;
      const r = parseStaveCssNumericComponent(parts[0], 255);
      const g = parseStaveCssNumericComponent(parts[1], 255);
      const b = parseStaveCssNumericComponent(parts[2], 255);
      const a = parseStaveCssAlpha(parts[3]);
      if (r == null || g == null || b == null || a == null) return null;
      return { r, g, b, a };
    }

    const srgbMatch = normalized.match(/^color\\(\\s*srgb\\s+(.*)\\)$/);
    if (srgbMatch) {
      const body = srgbMatch[1].replace(/\\s*\\/\\s*/, " ");
      const parts = body.trim().split(/\\s+/);
      if (parts.length < 3) return null;
      const r = parseStaveCssNumericComponent(parts[0], 1);
      const g = parseStaveCssNumericComponent(parts[1], 1);
      const b = parseStaveCssNumericComponent(parts[2], 1);
      const a = parseStaveCssAlpha(parts[3]);
      if (r == null || g == null || b == null || a == null) return null;
      return { r: r * 255, g: g * 255, b: b * 255, a };
    }

    return null;
  }

  function clampStaveColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function formatStaveCssColor(color) {
    const r = clampStaveColorChannel(color.r);
    const g = clampStaveColorChannel(color.g);
    const b = clampStaveColorChannel(color.b);
    if (color.a >= 0.999) {
      return "rgb(" + r + ", " + g + ", " + b + ")";
    }
    const alpha = Math.round(Math.max(0, Math.min(1, color.a)) * 1000) / 1000;
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function blendStaveCssColor(top, bottom) {
    const alpha = top.a + bottom.a * (1 - top.a);
    if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
      a: alpha,
    };
  }

  function resolveStaveVisibleBackgroundColor(el) {
    const layers = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const rawColor = window
        .getComputedStyle(current)
        .getPropertyValue("background-color");
      const color = parseStaveCssColor(rawColor);
      if (!color && rawColor && rawColor.trim() !== "transparent") {
        return null;
      }
      if (color && color.a > 0) {
        layers.push(color);
        if (color.a >= 0.999) break;
      }
      current = current.parentElement;
    }

    let visibleColor = { r: 255, g: 255, b: 255, a: 1 };
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      visibleColor = blendStaveCssColor(layers[index], visibleColor);
    }
    return formatStaveCssColor(visibleColor);
  }

  function staveComputedStylesForElement(el) {
    const cs = window.getComputedStyle(el);
    const computedStyles = {};
    for (const key of STAVE_LENS_STYLE_KEYS) {
      computedStyles[key] = cs.getPropertyValue(
        key.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase())
      );
    }

    const visibleBackgroundColor = resolveStaveVisibleBackgroundColor(el);
    if (
      visibleBackgroundColor &&
      visibleBackgroundColor !== computedStyles.backgroundColor
    ) {
      computedStyles.visibleBackgroundColor = visibleBackgroundColor;
    }

    return computedStyles;
  }
`;
}
