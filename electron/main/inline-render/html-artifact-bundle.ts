import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { parse as parseJavaScript } from "acorn";
import postcss from "postcss";
import values from "postcss-value-parser";
import { INLINE_RENDER_MAX_HTML_CHARS } from "../../../src/lib/inline-render/inline-render";

type Element = DefaultTreeAdapterMap["element"];
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 100;
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf" };
const unsupported = () => new Error("Export modules, nested documents and remote dependencies as standalone static HTML before saving.");
const embedded = (ref: string) => /^(?:data:|#)/i.test(ref);
function elements(node: DefaultTreeAdapterMap["node"]): Element[] {
  if (!("childNodes" in node)) return [];
  const children = node.childNodes.flatMap(elements);
  return "tagName" in node ? [node, ...children, ...(node.tagName === "template" ? elements((node as DefaultTreeAdapterMap["template"]).content) : [])] : children;
}
const attr = (node: Element, name: string) => node.attrs.find((entry) => entry.name === name);
function checkCssDependencies(parsed: ReturnType<typeof values>) {
  parsed.walk((node) => {
    // String-form image-set resources need an export step, just like srcset.
    if (node.type === "function" && /^(?:-webkit-)?image-set$/i.test(node.value) && node.nodes.some((child) => child.type === "string" && !embedded(child.value))) throw unsupported();
  });
}
const textOf = (node: Element) => node.childNodes.filter((child) => child.nodeName === "#text").map((child) => (child as DefaultTreeAdapterMap["textNode"]).value).join("");
function setText(node: Element, text: string) { node.childNodes = [{ nodeName: "#text", value: text, parentNode: node }]; }
function checkElement(node: Element) {
  if (["base", "iframe", "object", "embed"].includes(node.tagName) || attr(node, "srcset") || (["body", "table", "td", "th"].includes(node.tagName) && attr(node, "background"))) throw unsupported();
}
function checkScript(node: Element, script: string) {
  const type = attr(node, "type")?.value.trim().toLowerCase();
  if (type === "module" || type === "importmap") throw unsupported();
  // Data blocks (including JSON) are not executable JavaScript.
  if (type && !["text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type)) return;
  let tree;
  try { tree = parseJavaScript(script, { ecmaVersion: "latest", sourceType: "script" }); }
  catch { throw unsupported(); }
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if ("type" in node && node.type === "ImportExpression") throw unsupported();
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === "object") visit(value);
    }
  };
  visit(tree);
}

/** Static exports only. Parse code as code and HTML as HTML; never execute source or fetch a URL. */
export async function bundleHtmlArtifact(input: { workspacePath: string; fileUrl: string }): Promise<string> {
  const root = await realpath(input.workspacePath);
  let bytes = 0, files = 0;
  const active = new Set<string>();
  async function read(file: string) {
    const resolved = await realpath(file);
    const relative = path.relative(root, resolved);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("HTML assets must stay inside the reporting workspace.");
    const info = await stat(resolved);
    if (!info.isFile() || ++files > MAX_FILES || (bytes += info.size) > MAX_BYTES) throw new Error("HTML bundle exceeds the 100-file / 3 MiB limit.");
    return { resolved, body: await readFile(resolved) };
  }
  function local(ref: string, from: string) {
    if (embedded(ref)) return null;
    if (/^[a-z][\w+.-]*:|^\/\//i.test(ref)) throw unsupported();
    const decoded = decodeURIComponent(ref.split(/[?#]/)[0]!);
    if (decoded.startsWith("/") || decoded.startsWith("\\")) throw new Error("Root-relative assets are unsupported. Export with paths relative to the HTML file before saving.");
    return path.resolve(path.dirname(from), decoded);
  }
  async function asset(ref: string, from: string): Promise<string> {
    const file = local(ref, from);
    if (!file) return ref;
    const { resolved, body } = await read(file);
    const mime = MIME[path.extname(resolved).toLowerCase()];
    if (!mime) throw new Error("Unsupported static HTML asset type.");
    return `data:${mime};base64,${body.toString("base64")}`;
  }
  async function css(text: string, from: string): Promise<string> {
    const tree = postcss.parse(text);
    const imports: postcss.AtRule[] = [];
    tree.walkAtRules(/^import$/i, (rule) => { imports.push(rule); });
    for (const rule of imports) {
      const params = values(rule.params);
      const first = params.nodes[0];
      const ref = first?.type === "string" ? first.value : first?.type === "function" && first.value.toLowerCase() === "url" ? values.stringify(first.nodes).replace(/^["']|["']$/g, "") : null;
      if (!ref) throw unsupported();
      const file = local(ref, from);
      if (!file || active.has(file) || path.extname(file).toLowerCase() !== ".css") throw new Error("Unsupported or cyclic CSS import.");
      active.add(file);
      const entry = await read(file);
      const bundled = await css(entry.body.toString("utf8"), entry.resolved);
      active.delete(file);
      const media = values.stringify(params.nodes.slice(1)).trim();
      if (/\b(?:layer|supports)\b/i.test(media)) throw unsupported();
      rule.replaceWith(postcss.parse(media ? `@media ${media}{${bundled}}` : bundled));
    }
    const declarations: postcss.Declaration[] = [];
    tree.walkDecls((decl) => { declarations.push(decl); });
    for (const decl of declarations) {
      const parsed = values(decl.value);
      checkCssDependencies(parsed);
      const urls: values.FunctionNode[] = [];
      parsed.walk((node) => { if (node.type === "function" && node.value.toLowerCase() === "url") { urls.push(node); return false; } });
      for (const url of urls) {
        const ref = values.stringify(url.nodes).replace(/^["']|["']$/g, "").trim();
        // Preserve embedded references' original quoting, including SVG attribute quotes.
        if (embedded(ref)) continue;
        url.nodes = [{ type: "string", quote: '"', value: await asset(ref, from), sourceIndex: 0, sourceEndIndex: 0 }];
      }
      decl.value = parsed.toString();
    }
    return tree.toString();
  }
  const entry = await read(fileURLToPath(input.fileUrl));
  const document = parse(entry.body.toString("utf8"));
  for (const node of elements(document)) {
    checkElement(node);
    if (node.tagName === "link" && attr(node, "href")) {
      const href = attr(node, "href")!;
      const rel = attr(node, "rel")?.value.toLowerCase().split(/\s+/) ?? [];
      if (rel.includes("stylesheet")) {
        const file = local(href.value, entry.resolved);
        if (!file || path.extname(file).toLowerCase() !== ".css") throw unsupported();
        const sheet = await read(file);
        node.tagName = node.nodeName = "style";
        node.attrs = node.attrs.filter((a) => a.name === "media" || a.name === "nonce");
        setText(node, await css(sheet.body.toString("utf8"), sheet.resolved));
      } else if (rel.includes("icon")) href.value = await asset(href.value, entry.resolved);
      else throw unsupported();
    } else if (node.tagName === "style") setText(node, await css(textOf(node), entry.resolved));
    if (node.tagName === "script") {
      const src = attr(node, "src");
      let script = textOf(node);
      if (src) {
        const file = local(src.value, entry.resolved);
        if (!file || !/\.[cm]?js$/i.test(file)) throw unsupported();
        script = (await read(file)).body.toString("utf8");
      }
      checkScript(node, script);
      if (src) {
        // Keep parser/defer/async ordering and classic global bindings.
        src.value = `data:text/javascript;base64,${Buffer.from(script).toString("base64")}`;
        node.attrs = node.attrs.filter((a) => !["integrity", "crossorigin"].includes(a.name));
        setText(node, "");
      }
    }
    if (["img", "source", "video", "audio", "input", "image", "use", "feImage"].includes(node.tagName)) {
      for (const a of node.attrs) if (["src", "poster", "href"].includes(a.name)) a.value = await asset(a.value, entry.resolved);
    }
    const style = attr(node, "style");
    if (style) style.value = (await css(`a{${style.value}}`, entry.resolved)).slice(2, -1);
  }
  const html = serialize(document);
  if (html.length > INLINE_RENDER_MAX_HTML_CHARS) throw new Error("The bundled HTML exceeds the saved preview limit.");
  assertSelfContainedHtml(html);
  return html;
}

/** Validate existing renders without treating text/comments/data attributes as dependencies. */
export function assertSelfContainedHtml(html: string) {
  for (const node of elements(parse(html))) {
    checkElement(node);
    for (const a of node.attrs) if (["src", "poster"].includes(a.name) || (a.name === "href" && ["link", "image", "use", "feImage"].includes(node.tagName))) {
      if (!embedded(a.value)) throw new Error("Saved HTML must embed its assets before it can be archived.");
    }
    if (node.tagName === "script") {
      const src = attr(node, "src");
      let script = textOf(node);
      if (src) {
        if (!src.value.startsWith("data:text/javascript;base64,")) throw unsupported();
        script = Buffer.from(src.value.slice("data:text/javascript;base64,".length), "base64").toString("utf8");
      }
      checkScript(node, script);
    }
    const styles = node.tagName === "style" ? textOf(node) : attr(node, "style") ? `a{${attr(node, "style")!.value}}` : "";
    if (!styles) continue;
    const tree = postcss.parse(styles);
    tree.walkAtRules(/^import$/i, () => { throw new Error("Saved HTML must embed its stylesheets."); });
    tree.walkDecls((decl) => {
      const parsed = values(decl.value);
      checkCssDependencies(parsed);
      parsed.walk((value) => {
      if (value.type === "function" && value.value.toLowerCase() === "url" && !embedded(values.stringify(value.nodes).replace(/^["']|["']$/g, "").trim())) throw new Error("Saved HTML must embed its CSS assets.");
    }); });
  }
}
