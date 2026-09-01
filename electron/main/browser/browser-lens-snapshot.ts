// ---------------------------------------------------------------------------
// Ref-based page snapshots for the agent ABI
//
// Owns the half of the snapshot that has a lifetime: which document a ref
// belongs to, and when that document stops existing. The rendering itself is
// pure and lives in `src/lib/lens/lens-snapshot.ts`.
// ---------------------------------------------------------------------------

import {
  buildLensSnapshot,
  parseLensRef,
  type LensAxNode,
  type LensSnapshotRef,
} from "../../../src/lib/lens/lens-snapshot";
import {
  EMPTY_LENS_APPEARANCE,
  isLensAppearanceEmpty,
  planLensAppearanceCommands,
  resolveLensAppearanceState,
  type LensAppearanceRequest,
  type LensAppearanceState,
} from "../../../src/lib/lens/lens-emulation";
import { sendCdpCommand } from "./browser-cdp-controller";

/**
 * How many actions are remembered per session.
 *
 * The timeline exists so a model does not re-derive what it already did this
 * turn; it is not an audit log, and an unbounded one would grow with the
 * session rather than with the turn.
 */
const MAX_ACTION_TIMELINE = 25;

export interface LensActionRecord {
  tool: string;
  target?: string;
  status: "succeeded" | "failed";
  error?: string;
  at: string;
}

interface SnapshotRegistryEntry {
  /**
   * The document the refs belong to.
   *
   * A ref is only meaningful inside the document that minted it, so this is the
   * fence: on a cross-document navigation the whole table is discarded rather
   * than filtered. Two documents can hand out the same `backendNodeId`, which
   * is why "still resolves" is not the same question as "still correct".
   */
  loaderId: string;
  /**
   * How many documents this session has snapshotted, and the number carried in
   * every ref it minted. Replacing the table is not enough on its own: the next
   * document mints `e1` too, so a ref from the page before would resolve
   * against a different element rather than fail. The generation in the token is
   * what makes that a rejection.
   */
  documentGeneration: number;
  refs: Map<string, LensSnapshotRef>;
  /** Ref keys from this capture, so the next one can mark what is new. */
  keys: Set<string>;
  actions: LensActionRecord[];
}

const registry = new Map<number, SnapshotRegistryEntry>();

function entryFor(webContentsId: number): SnapshotRegistryEntry | undefined {
  return registry.get(webContentsId);
}

/** Forget a session's refs and timeline. Called when its page goes away. */
export function disposeLensSnapshotState(webContentsId: number): void {
  registry.delete(webContentsId);
  appearanceBySession.delete(webContentsId);
}

/**
 * Record what an agent just did, so the next snapshot can say so.
 *
 * Failures are kept deliberately: "I already tried this and it did not work" is
 * the single most useful thing a timeline can carry, and dropping it is how a
 * model ends up retrying the same broken action every turn.
 */
export function recordLensAction(
  webContentsId: number,
  record: Omit<LensActionRecord, "at">,
): void {
  const entry = entryFor(webContentsId);
  if (!entry) {
    return;
  }
  entry.actions.push({ ...record, at: new Date().toISOString() });
  if (entry.actions.length > MAX_ACTION_TIMELINE) {
    entry.actions.splice(0, entry.actions.length - MAX_ACTION_TIMELINE);
  }
}

export function getLensActionTimeline(
  webContentsId: number,
): LensActionRecord[] {
  return entryFor(webContentsId)?.actions ?? [];
}

interface FrameTreeNode {
  frame: { id: string; loaderId?: string; url?: string; name?: string };
  childFrames?: FrameTreeNode[];
}

async function getFrameTree(webContentsId: number): Promise<FrameTreeNode> {
  const result = (await sendCdpCommand(webContentsId, "Page.getFrameTree")) as {
    frameTree: FrameTreeNode;
  };
  return result.frameTree;
}

async function getAxNodes(
  webContentsId: number,
  frameId?: string,
): Promise<LensAxNode[]> {
  const result = (await sendCdpCommand(
    webContentsId,
    "Accessibility.getFullAXTree",
    frameId ? { frameId } : {},
  )) as { nodes?: LensAxNode[] };
  return result.nodes ?? [];
}

export interface LensSnapshotResult {
  url: string;
  title: string;
  loaderId: string;
  text: string;
  refCount: number;
  omitted: number;
  truncated: boolean;
}

export interface CaptureLensSnapshotOptions {
  maxDepth?: number;
  maxNodes?: number;
  interactableOnly?: boolean;
  /** Include subframes. Off by default: most pages have none worth the tokens. */
  includeFrames?: boolean;
}

/**
 * Capture a snapshot and install its ref table.
 *
 * Subframes are numbered in frame-tree order and mint `f<N>e<N>` refs, so a ref
 * carries the document it belongs to in its own text. That is not cosmetic: it
 * is what makes resolving a ref against the wrong frame impossible to express
 * rather than merely unlikely.
 */
export async function captureLensSnapshot(
  webContentsId: number,
  options: CaptureLensSnapshotOptions = {},
): Promise<LensSnapshotResult> {
  const tree = await getFrameTree(webContentsId);
  const loaderId = tree.frame.loaderId ?? "";
  const previous = entryFor(webContentsId);
  const sameDocument = previous?.loaderId === loaderId;
  const previousKeys = sameDocument ? previous?.keys : undefined;
  // Re-snapshotting the same document keeps its generation, so refs an agent is
  // already holding stay valid across a refresh of the outline.
  const documentGeneration = sameDocument
    ? (previous?.documentGeneration ?? 1)
    : (previous?.documentGeneration ?? 0) + 1;

  const frames: Array<{ ordinal: number; frameId?: string; label?: string }> = [
    { ordinal: 0 },
  ];
  if (options.includeFrames) {
    let ordinal = 0;
    const walk = (nodes: FrameTreeNode[] | undefined) => {
      for (const child of nodes ?? []) {
        ordinal += 1;
        frames.push({
          ordinal,
          frameId: child.frame.id,
          label: child.frame.url ?? child.frame.name,
        });
        walk(child.childFrames);
      }
    };
    walk(tree.childFrames);
  }

  const refs = new Map<string, LensSnapshotRef>();
  const keys = new Set<string>();
  const sections: string[] = [];
  let omitted = 0;
  let truncated = false;

  for (const frame of frames) {
    let nodes: LensAxNode[];
    try {
      nodes = await getAxNodes(webContentsId, frame.frameId);
    } catch {
      // A frame that went away between the tree read and this call is not a
      // failure of the snapshot; the rest of the page is still worth returning.
      continue;
    }

    const snapshot = buildLensSnapshot(nodes, {
      documentGeneration,
      frameOrdinal: frame.ordinal,
      maxDepth: options.maxDepth,
      maxNodes: options.maxNodes,
      interactableOnly: options.interactableOnly,
      previousKeys,
    });

    for (const ref of snapshot.refs) {
      /*
       * Stored in exactly the shape the builder compares against. They diverged
       * once — the builder tested a bare backend id while this stored a
       * loader-scoped one — and the symptom was every node in every snapshot
       * marked `*` new, which reads as "the page changed completely" on a page
       * that had not changed at all. The document scoping that pairing was
       * meant to add is already done, twice: `sameDocument` gates whether
       * previous keys are offered at all, and the generation in the ref token
       * gates whether a ref may be used.
       */
      refs.set(ref.ref, ref);
      keys.add(ref.key);
    }

    omitted += snapshot.omitted;
    truncated = truncated || snapshot.truncated;
    if (snapshot.text) {
      sections.push(
        frame.ordinal === 0
          ? snapshot.text
          : `# frame f${frame.ordinal}${frame.label ? ` ${frame.label}` : ""}\n${snapshot.text}`,
      );
    }
  }

  /*
   * `previousKeys` above was read against the *old* table, so the delta markers
   * are already rendered; installing the new table here is what makes the next
   * capture's delta correct.
   */
  registry.set(webContentsId, {
    loaderId,
    documentGeneration,
    refs,
    keys,
    actions: previous?.actions ?? [],
  });

  const [url, title] = await Promise.all([
    evaluateString(webContentsId, "location.href"),
    evaluateString(webContentsId, "document.title"),
  ]);

  return {
    url,
    title,
    loaderId,
    text: sections.join("\n\n"),
    refCount: refs.size,
    omitted,
    truncated,
  };
}

async function evaluateString(
  webContentsId: number,
  expression: string,
): Promise<string> {
  try {
    const result = (await sendCdpCommand(webContentsId, "Runtime.evaluate", {
      expression,
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    return typeof result.result?.value === "string" ? result.result.value : "";
  } catch {
    return "";
  }
}

/**
 * Turn a ref back into a live CDP object handle.
 *
 * Every failure here is loud and says what to do about it. That is the entire
 * point of the ref scheme: the alternative — a selector — cannot tell "this
 * matched nothing" apart from "this matched something else", so it reports
 * success either way.
 */
export async function resolveLensRefToObjectId(
  webContentsId: number,
  ref: string,
): Promise<string> {
  const parsed = parseLensRef(ref);
  if (!parsed) {
    throw new Error(`"${ref}" is not a Lens ref.`);
  }

  const entry = entryFor(webContentsId);
  if (!entry) {
    throw new Error(
      `Ref ${ref} cannot be resolved: this page has no snapshot yet. Call stave_lens_snapshot first.`,
    );
  }

  if (parsed.documentGeneration !== entry.documentGeneration) {
    /*
     * Checked before anything is looked up, and this is the check that matters.
     * The table may well contain a `${ref}`-shaped key — the current document
     * minted its own `e1` — so a lookup-first implementation would find *an*
     * element and act on it. The generation says whether it is the element the
     * agent was looking at.
     */
    throw new Error(
      `Ref ${ref} belongs to a page this session has navigated away from. Take a new snapshot with stave_lens_snapshot; refs are renumbered for each document.`,
    );
  }

  const tree = await getFrameTree(webContentsId);
  const loaderId = tree.frame.loaderId ?? "";
  if (loaderId !== entry.loaderId) {
    // The page moved on since the snapshot and nothing has re-snapshotted yet,
    // so the whole table describes a document that is gone.
    registry.delete(webContentsId);
    throw new Error(
      `Ref ${ref} belongs to a page that has since navigated. Take a new snapshot with stave_lens_snapshot.`,
    );
  }

  const target = entry.refs.get(ref);
  if (!target) {
    throw new Error(
      `Ref ${ref} is not in the current page snapshot. Take a new snapshot with stave_lens_snapshot.`,
    );
  }

  let resolved: { object?: { objectId?: string } };
  try {
    resolved = (await sendCdpCommand(webContentsId, "DOM.resolveNode", {
      backendNodeId: target.backendNodeId,
      objectGroup: "lens-refs",
    })) as { object?: { objectId?: string } };
  } catch (error) {
    throw new Error(
      `Ref ${ref} (${target.role} "${target.name}") no longer exists on this page. Take a new snapshot. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const objectId = resolved.object?.objectId;
  if (!objectId) {
    throw new Error(
      `Ref ${ref} (${target.role} "${target.name}") no longer exists on this page. Take a new snapshot.`,
    );
  }

  // Resolving proves the node is still in the agent's table; `isConnected`
  // proves it is still in the document. A detached node resolves fine.
  const connected = (await sendCdpCommand(
    webContentsId,
    "Runtime.callFunctionOn",
    {
      objectId,
      functionDeclaration: "function () { return this.isConnected === true; }",
      returnByValue: true,
    },
  )) as { result?: { value?: unknown } };

  if (connected.result?.value !== true) {
    throw new Error(
      `Ref ${ref} (${target.role} "${target.name}") has been removed from the page. Take a new snapshot.`,
    );
  }

  return objectId;
}

/** Describe a ref for an error message or a timeline entry. */
export function describeLensRef(
  webContentsId: number,
  ref: string,
): string | undefined {
  const target = entryFor(webContentsId)?.refs.get(ref);
  return target ? `${target.role} "${target.name}"` : undefined;
}

// ---------------------------------------------------------------------------
// Appearance emulation
// ---------------------------------------------------------------------------

/**
 * What appearance emulation a session is currently under.
 *
 * A mirror of the CDP session's own override, not a durable intent, and the
 * distinction is the whole design. The override lives on the debugger session:
 * it survives a navigation and a reload, and it dies with the guest. So this map
 * is keyed by the same `webContentsId` and torn down with it — a rebuilt session
 * genuinely is unemulated, and the honest thing is to report that rather than to
 * re-apply behind the agent's back or, worse, to keep reporting an override the
 * page no longer has.
 */
const appearanceBySession = new Map<number, LensAppearanceState>();

export function getLensAppearanceState(
  webContentsId: number,
): LensAppearanceState {
  return appearanceBySession.get(webContentsId) ?? { ...EMPTY_LENS_APPEARANCE };
}

/** Apply a request on top of whatever this session already had. */
export async function applyLensAppearance(
  webContentsId: number,
  request: LensAppearanceRequest,
): Promise<LensAppearanceState> {
  const next = resolveLensAppearanceState(
    getLensAppearanceState(webContentsId),
    request,
  );

  for (const command of planLensAppearanceCommands(next)) {
    await sendCdpCommand(webContentsId, command.method, command.params);
  }

  if (isLensAppearanceEmpty(next)) {
    appearanceBySession.delete(webContentsId);
  } else {
    appearanceBySession.set(webContentsId, next);
  }
  return next;
}
