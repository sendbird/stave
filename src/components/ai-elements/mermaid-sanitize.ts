import DOMPurify from "dompurify";

/**
 * Mermaid renders agent-written diagram source. Strict mode already escapes
 * labels and drops click handlers; this second pass keeps only SVG, so a
 * diagram can never carry a script, an embedded document, or a link out.
 */
export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["script", "foreignObject", "iframe", "a", "image", "use"],
    FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
  });
}
