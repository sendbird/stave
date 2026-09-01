/**
 * The page, as something an agent can address.
 *
 * Lens has shipped a raw `Accessibility.getFullAXTree({depth: 4})` dump as its
 * snapshot, and CSS selectors as the way to act on what the dump described.
 * Both are weaker than they look, and for reasons that are properties of the
 * mechanism rather than of the implementation:
 *
 * - **A selector is a query, not a handle.** It is resolved fresh on every use,
 *   so after any DOM change it can match a *different* element — and there is no
 *   way for either side to notice that it did. The agent sees a successful
 *   click on the wrong thing. A handle minted per snapshot and keyed to node
 *   identity can be invalidated instead, which turns that silent
 *   mis-click into a loud "take a new snapshot".
 * - **A raw tree spends its tokens on nodes no action can address.** Most of an
 *   AX tree is structure. Refs belong on the nodes an agent can actually click
 *   or type into; everything else is context and can be summarised or dropped
 *   under a budget.
 *
 * This module is the pure half: AX nodes in, indented text plus a ref table
 * out. It knows nothing about CDP, sessions, or navigation — the main process
 * owns the table's lifetime, because that is where document identity lives.
 */

/** The slice of a CDP `Accessibility.AXNode` this module reads. */
export interface LensAxNode {
  nodeId: string;
  ignored?: boolean;
  role?: { value?: unknown };
  name?: { value?: unknown };
  description?: { value?: unknown };
  value?: { value?: unknown };
  properties?: ReadonlyArray<{ name?: string; value?: { value?: unknown } }>;
  childIds?: ReadonlyArray<string>;
  backendDOMNodeId?: number;
}

export interface LensSnapshotRef {
  /** The token an agent passes back, e.g. `e12` or `f2e3`. */
  ref: string;
  backendNodeId: number;
  /**
   * Identity for the delta marker, stable across text churn and unstable across
   * a navigation — which is the lifetime that matters, because
   * `previousKeys` is only ever supplied for the same document. Scoping it to a
   * loader id as well would be redundant, and getting that redundancy subtly
   * wrong is how every node ends up marked new.
   */
  key: string;
  role: string;
  name: string;
}

export interface LensSnapshotOptions {
  /**
   * Which document minted these refs. Increments on every cross-document
   * navigation in the session; see {@link formatLensRef}.
   */
  documentGeneration: number;
  /**
   * Frame ordinal. 0 is the main frame; a subframe adds `f<N>` so a ref cannot
   * be resolved against a sibling frame by accident.
   */
  frameOrdinal?: number;
  /** Maximum tree depth to render. Root is depth 0. */
  maxDepth?: number;
  /** Hard cap on rendered nodes. What is cut is reported, never silently lost. */
  maxNodes?: number;
  /** Render only nodes that carry a ref, plus the structure needed to reach them. */
  interactableOnly?: boolean;
  /** Append `[box=x,y,w,h]` where a rect is known. */
  boxes?: ReadonlyMap<number, LensSnapshotBox>;
  /**
   * Ref keys from the previous snapshot of this document. Nodes absent from it
   * are marked `*`, which is what lets an agent see what a click changed
   * without diffing two full trees itself.
   */
  previousKeys?: ReadonlySet<string>;
}

export interface LensSnapshotBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LensSnapshot {
  text: string;
  refs: LensSnapshotRef[];
  /** Nodes the budget or depth cap left out. */
  omitted: number;
  truncated: boolean;
}

/**
 * Roles that an agent can act on.
 *
 * Kept as an explicit set rather than derived from `focusable`, because
 * `focusable` is also true for scroll containers and for anything carrying
 * `tabindex`, which would put a ref on most of a modern page. A node outside
 * this set still earns a ref when it is explicitly `focusable` *and* names
 * itself — that is the escape hatch for custom widgets.
 */
/**
 * Roles that describe the document itself.
 *
 * Chromium reports `RootWebArea` as focusable and names it with the page title,
 * which is enough to pass the focusable-and-named test below — so without this
 * the whole document takes a ref, an `interactableOnly` snapshot still opens
 * with it, and the ref is useless because there is no action for "the page".
 */
const DOCUMENT_ROLES = new Set(["RootWebArea", "WebArea", "document"]);

const INTERACTABLE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

/** Roles whose presence is meaningful even though nothing can click them. */
const LANDMARK_ROLES = new Set([
  "alert",
  "alertdialog",
  "article",
  "banner",
  "complementary",
  "contentinfo",
  "dialog",
  "form",
  "heading",
  "main",
  "navigation",
  "region",
  "search",
  "status",
  "table",
]);

/** AX properties worth one bracketed token each. */
const STATE_PROPERTIES = [
  "checked",
  "disabled",
  "expanded",
  "focused",
  "invalid",
  "level",
  "pressed",
  "readonly",
  "required",
  "selected",
] as const;

const DEFAULT_MAX_NODES = 800;
const DEFAULT_MAX_DEPTH = 25;
const MAX_NAME_CHARS = 160;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncate(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > limit
    ? `${collapsed.slice(0, limit - 1)}…`
    : collapsed;
}

function propertyValue(
  node: LensAxNode,
  name: string,
): string | number | boolean | undefined {
  const property = node.properties?.find((entry) => entry.name === name);
  const value = property?.value?.value;
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

function nodeRole(node: LensAxNode): string {
  return text(node.role?.value);
}

function nodeName(node: LensAxNode): string {
  return truncate(text(node.name?.value), MAX_NAME_CHARS);
}

/**
 * Whether an agent can address this node.
 *
 * Deliberately conservative about `disabled`: a disabled control is visible,
 * describable, and worth a line — but a ref on it invites an action that can
 * only fail, so it gets the line without the handle.
 */
export function isLensInteractableNode(node: LensAxNode): boolean {
  if (node.ignored || node.backendDOMNodeId === undefined) {
    return false;
  }
  if (propertyValue(node, "disabled") === true) {
    return false;
  }
  if (propertyValue(node, "hidden") === true) {
    return false;
  }
  const role = nodeRole(node);
  if (DOCUMENT_ROLES.has(role)) {
    return false;
  }
  if (INTERACTABLE_ROLES.has(role)) {
    return true;
  }
  return propertyValue(node, "focusable") === true && nodeName(node).length > 0;
}

function stateTokens(node: LensAxNode): string[] {
  const tokens: string[] = [];
  for (const name of STATE_PROPERTIES) {
    const value = propertyValue(node, name);
    if (value === undefined || value === false || value === "false") {
      continue;
    }
    tokens.push(value === true || value === "true" ? name : `${name}=${value}`);
  }
  return tokens;
}

/**
 * The ref token for a node.
 *
 * The document generation is always present, and that is the point rather than
 * a detail. A ref is only meaningful inside the document that minted it — but
 * "the table was replaced" is not enough to catch reuse, because the *next*
 * document mints `e1` too. An agent holding `e1` from the page before a
 * navigation would have it resolve, silently, against a different element that
 * merely happens to be first in the new tree. Numbering the document into the
 * token makes that impossible to express instead of unlikely to happen.
 */
export function formatLensRef(
  documentGeneration: number,
  frameOrdinal: number,
  index: number,
): string {
  const frame = frameOrdinal > 0 ? `f${frameOrdinal}` : "";
  return `d${documentGeneration}${frame}e${index}`;
}

const REF_PATTERN = /^d(\d+)(?:f(\d+))?e(\d+)$/;

export interface LensParsedRef {
  documentGeneration: number;
  frameOrdinal: number;
  index: number;
}

/**
 * Parse a ref token, or return null.
 *
 * Anchored, and that matters more than it looks: an unanchored version matches
 * inside ordinary CSS selectors — `#d1e43` is a perfectly ordinary id — so a
 * tool accepting `ref | selector` would silently route a selector down the ref
 * path, or worse, a ref down the selector path.
 */
export function parseLensRef(value: string): LensParsedRef | null {
  const match = REF_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    documentGeneration: Number(match[1]),
    frameOrdinal: match[2] ? Number(match[2]) : 0,
    index: Number(match[3]),
  };
}

/** Which of the two addressing modes a tool argument is asking for. */
export type LensTarget =
  | { kind: "ref"; ref: string }
  | { kind: "selector"; selector: string };

export function resolveLensTarget(value: string): LensTarget {
  const trimmed = value.trim();
  return parseLensRef(trimmed)
    ? { kind: "ref", ref: trimmed }
    : { kind: "selector", selector: trimmed };
}

/**
 * Render an AX tree as indented lines with refs.
 *
 * The traversal is explicit rather than recursive so the node budget can stop
 * it mid-tree and report exactly how much was left, which is the difference
 * between a snapshot an agent can trust and one that quietly ends early.
 */
export function buildLensSnapshot(
  nodes: ReadonlyArray<LensAxNode>,
  options: LensSnapshotOptions,
): LensSnapshot {
  const {
    documentGeneration,
    frameOrdinal = 0,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxNodes = DEFAULT_MAX_NODES,
    interactableOnly = false,
    boxes,
    previousKeys,
  } = options;

  const byId = new Map<string, LensAxNode>();
  for (const node of nodes) {
    byId.set(node.nodeId, node);
  }
  const root = nodes[0];
  if (!root) {
    return { text: "", refs: [], omitted: 0, truncated: false };
  }

  const refs: LensSnapshotRef[] = [];
  const lines: string[] = [];
  let refIndex = 0;
  let omitted = 0;
  let truncated = false;

  /*
   * A node earns a line if it is interactable, is a landmark, or names itself.
   * Everything else is a wrapper: it is walked through, but its children are
   * rendered at its own indent so the output does not accumulate meaningless
   * nesting.
   */
  const isRenderable = (node: LensAxNode): boolean => {
    if (node.ignored) {
      return false;
    }
    if (isLensInteractableNode(node)) {
      return true;
    }
    if (interactableOnly) {
      return false;
    }
    const role = nodeRole(node);
    if (!role || role === "generic" || role === "none" || role === "InlineTextBox") {
      return false;
    }
    return LANDMARK_ROLES.has(role) || nodeName(node).length > 0;
  };

  const visit = (node: LensAxNode, depth: number, indent: number): void => {
    if (truncated) {
      return;
    }
    const renderable = isRenderable(node);

    if (renderable) {
      if (lines.length >= maxNodes) {
        truncated = true;
        omitted += 1;
        return;
      }

      const parts = [nodeRole(node) || "node"];
      const name = nodeName(node);
      if (name) {
        parts.push(JSON.stringify(name));
      }

      const states = stateTokens(node);
      if (states.length > 0) {
        parts.push(`[${states.join(" ")}]`);
      }

      const url = propertyValue(node, "url");
      if (typeof url === "string" && url) {
        parts.push(`/url:${truncate(url, 200)}`);
      }

      const value = truncate(text(node.value?.value), MAX_NAME_CHARS);
      if (value) {
        parts.push(`value=${JSON.stringify(value)}`);
      }

      let isNew = false;
      if (isLensInteractableNode(node) && node.backendDOMNodeId !== undefined) {
        refIndex += 1;
        const ref = formatLensRef(documentGeneration, frameOrdinal, refIndex);
        const key = String(node.backendDOMNodeId);
        refs.push({
          ref,
          backendNodeId: node.backendDOMNodeId,
          key,
          role: nodeRole(node),
          name,
        });
        parts.push(`[ref=${ref}]`);
        isNew = previousKeys ? !previousKeys.has(key) : false;
      }

      const box =
        boxes && node.backendDOMNodeId !== undefined
          ? boxes.get(node.backendDOMNodeId)
          : undefined;
      if (box) {
        parts.push(
          `[box=${Math.round(box.x)},${Math.round(box.y)},${Math.round(
            box.width,
          )},${Math.round(box.height)}]`,
        );
      }

      lines.push(
        `${"  ".repeat(indent)}${isNew ? "* " : ""}${parts.join(" ")}`,
      );
    }

    if (depth >= maxDepth) {
      omitted += node.childIds?.length ?? 0;
      return;
    }

    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId);
      if (!child) {
        continue;
      }
      visit(child, depth + 1, renderable ? indent + 1 : indent);
    }
  };

  visit(root, 0, 0);

  if (truncated) {
    // Count what was never walked, so the notice is a number rather than a
    // vague warning. Cheap: the tree is already in memory.
    omitted = Math.max(omitted, nodes.length - lines.length);
    lines.push(
      `... (${omitted} more below — narrow with depth/interactableOnly, or scroll to reveal)`,
    );
  }

  return { text: lines.join("\n"), refs, omitted, truncated };
}
