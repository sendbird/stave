import { describe, expect, test } from "bun:test";
import {
  buildLensSnapshot,
  formatLensRef,
  isLensInteractableNode,
  parseLensRef,
  resolveLensTarget,
  type LensAxNode,
} from "../src/lib/lens/lens-snapshot";

function node(
  overrides: Partial<LensAxNode> & { nodeId: string },
): LensAxNode {
  return {
    role: { value: "generic" },
    name: { value: "" },
    childIds: [],
    ...overrides,
  };
}

function property(name: string, value: unknown) {
  return { name, value: { value } };
}

describe("parseLensRef", () => {
  test("accepts main-frame and subframe refs", () => {
    expect(parseLensRef("d1e1")).toEqual({
      documentGeneration: 1,
      frameOrdinal: 0,
      index: 1,
    });
    expect(parseLensRef("d3e42")).toEqual({
      documentGeneration: 3,
      frameOrdinal: 0,
      index: 42,
    });
    expect(parseLensRef("d1f2e3")).toEqual({
      documentGeneration: 1,
      frameOrdinal: 2,
      index: 3,
    });
  });

  test("is anchored, so a selector containing a ref-shaped run is not a ref", () => {
    // An unanchored pattern matches inside ordinary selectors and would route a
    // selector down the ref path, where it resolves against nothing.
    expect(parseLensRef("#z2l9d1e43l3")).toBeNull();
    expect(parseLensRef(".btn d1e1")).toBeNull();
    expect(parseLensRef("[data-ref=d1e1]")).toBeNull();
    expect(parseLensRef("d1e1 > span")).toBeNull();
  });

  test("rejects a ref with no document generation", () => {
    // The generation is what makes a ref from the previous page a rejection
    // rather than a silent hit on whatever is first in the new tree.
    expect(parseLensRef("e1")).toBeNull();
    expect(parseLensRef("f2e3")).toBeNull();
  });

  test("rejects near-misses", () => {
    expect(parseLensRef("")).toBeNull();
    expect(parseLensRef("d1e")).toBeNull();
    expect(parseLensRef("d1f2")).toBeNull();
    expect(parseLensRef("dfe1")).toBeNull();
    expect(parseLensRef("D1E1")).toBeNull();
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseLensRef("  d1e7 ")).toEqual({
      documentGeneration: 1,
      frameOrdinal: 0,
      index: 7,
    });
  });
});

describe("resolveLensTarget", () => {
  test("routes refs and selectors to different modes", () => {
    expect(resolveLensTarget("d1e3")).toEqual({ kind: "ref", ref: "d1e3" });
    expect(resolveLensTarget("d2f1e3")).toEqual({
      kind: "ref",
      ref: "d2f1e3",
    });
    expect(resolveLensTarget("button.primary")).toEqual({
      kind: "selector",
      selector: "button.primary",
    });
    expect(resolveLensTarget("#z2l9d1e43l3")).toEqual({
      kind: "selector",
      selector: "#z2l9d1e43l3",
    });
  });
});

describe("formatLensRef", () => {
  test("every ref carries its document, and subframes their frame", () => {
    expect(formatLensRef(1, 0, 5)).toBe("d1e5");
    expect(formatLensRef(1, 3, 5)).toBe("d1f3e5");
    // The same node position in the next document is a different token, which
    // is what turns reuse into an error instead of a wrong click.
    expect(formatLensRef(2, 0, 5)).toBe("d2e5");
  });
});

describe("isLensInteractableNode", () => {
  test("accepts interactable roles", () => {
    expect(
      isLensInteractableNode(
        node({ nodeId: "1", role: { value: "button" }, backendDOMNodeId: 1 }),
      ),
    ).toBe(true);
  });

  test("rejects a node with no backing DOM node", () => {
    expect(
      isLensInteractableNode(node({ nodeId: "1", role: { value: "button" } })),
    ).toBe(false);
  });

  test("rejects ignored and hidden nodes", () => {
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "button" },
          backendDOMNodeId: 1,
          ignored: true,
        }),
      ),
    ).toBe(false);
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "button" },
          backendDOMNodeId: 1,
          properties: [property("hidden", true)],
        }),
      ),
    ).toBe(false);
  });

  test("a disabled control keeps its line but earns no ref", () => {
    // A ref on it would only invite an action that can never succeed.
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "button" },
          backendDOMNodeId: 1,
          properties: [property("disabled", true)],
        }),
      ),
    ).toBe(false);
  });

  test("a named focusable custom widget is addressable", () => {
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "gridcell" },
          name: { value: "Row 3" },
          backendDOMNodeId: 1,
          properties: [property("focusable", true)],
        }),
      ),
    ).toBe(true);
  });

  test("the document root is never a target", () => {
    // Chromium reports it focusable and names it with the page title, so it
    // passes the custom-widget test — but there is no action for "the page",
    // and a ref on it is the first line of every interactableOnly snapshot.
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "RootWebArea" },
          name: { value: "Checkout" },
          backendDOMNodeId: 1,
          properties: [property("focusable", true)],
        }),
      ),
    ).toBe(false);
  });

  test("an unnamed focusable container is not, or most of a page gets a ref", () => {
    expect(
      isLensInteractableNode(
        node({
          nodeId: "1",
          role: { value: "generic" },
          backendDOMNodeId: 1,
          properties: [property("focusable", true)],
        }),
      ),
    ).toBe(false);
  });
});

describe("buildLensSnapshot", () => {
  const page: LensAxNode[] = [
    node({
      nodeId: "1",
      role: { value: "RootWebArea" },
      name: { value: "Checkout" },
      childIds: ["2", "5"],
    }),
    node({ nodeId: "2", role: { value: "generic" }, childIds: ["3", "4"] }),
    node({
      nodeId: "3",
      role: { value: "link" },
      name: { value: "Home" },
      backendDOMNodeId: 31,
      properties: [property("url", "https://example.test/")],
    }),
    node({
      nodeId: "4",
      role: { value: "textbox" },
      name: { value: "Email" },
      value: { value: "a@b.test" },
      backendDOMNodeId: 41,
      properties: [property("required", true), property("focused", true)],
    }),
    node({
      nodeId: "5",
      role: { value: "button" },
      name: { value: "Pay now" },
      backendDOMNodeId: 51,
    }),
  ];

  test("renders one indented line per node with refs on the addressable ones", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1 });
    expect(snapshot.text).toBe(
      [
        'RootWebArea "Checkout"',
        '  link "Home" /url:https://example.test/ [ref=d1e1]',
        '  textbox "Email" [focused required] value="a@b.test" [ref=d1e2]',
        '  button "Pay now" [ref=d1e3]',
      ].join("\n"),
    );
  });

  test("a wrapper does not consume an indent level", () => {
    // The `generic` node 2 is walked through, not rendered, so its children sit
    // at the root's indent rather than accumulating meaningless nesting.
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1 });
    expect(snapshot.text.split("\n")[1].startsWith("  link")).toBe(true);
  });

  test("refs are minted in document order and map back to backend nodes", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1 });
    expect(snapshot.refs.map((entry) => entry.ref)).toEqual([
      "d1e1",
      "d1e2",
      "d1e3",
    ]);
    expect(snapshot.refs.map((entry) => entry.backendNodeId)).toEqual([
      31, 41, 51,
    ]);
  });

  test("a subframe mints prefixed refs", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 4, frameOrdinal: 2 });
    expect(snapshot.refs.map((entry) => entry.ref)).toEqual([
      "d4f2e1",
      "d4f2e2",
      "d4f2e3",
    ]);
  });

  test("interactableOnly drops descriptive nodes but keeps every ref", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1, interactableOnly: true });
    expect(snapshot.text).not.toContain("RootWebArea");
    expect(snapshot.refs).toHaveLength(3);
  });

  test("boxes are opt-in", () => {
    const withoutBoxes = buildLensSnapshot(page, { documentGeneration: 1 });
    expect(withoutBoxes.text).not.toContain("[box=");

    const snapshot = buildLensSnapshot(page, {
      documentGeneration: 1,
      boxes: new Map([[51, { x: 10.4, y: 20.6, width: 100, height: 32 }]]),
    });
    expect(snapshot.text).toContain("[box=10,21,100,32]");
  });

  test("nodes new since the previous snapshot are marked", () => {
    const snapshot = buildLensSnapshot(page, {
      documentGeneration: 1,
      previousKeys: new Set(["31", "41"]),
    });
    const payLine = snapshot.text
      .split("\n")
      .find((line) => line.includes("Pay now"));
    expect(payLine?.trim().startsWith("* ")).toBe(true);
    expect(snapshot.text).not.toContain('* link "Home"');
  });

  test("with no previous snapshot nothing is marked new", () => {
    // Marking every node on a first snapshot would make the delta meaningless.
    expect(buildLensSnapshot(page, { documentGeneration: 1 }).text).not.toContain("*");
  });

  test("the node budget truncates loudly, with a count", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1, maxNodes: 2 });
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.text).toContain("more below");
    expect(snapshot.omitted).toBeGreaterThan(0);
    // Whatever was rendered still has usable refs; the cut is not a failure.
    expect(snapshot.refs.length).toBeGreaterThan(0);
  });

  test("depth caps the walk and reports what it skipped", () => {
    const snapshot = buildLensSnapshot(page, { documentGeneration: 1, maxDepth: 0 });
    expect(snapshot.text).toBe('RootWebArea "Checkout"');
    expect(snapshot.omitted).toBe(2);
  });

  test("an empty tree is empty, not an error", () => {
    expect(buildLensSnapshot([], { documentGeneration: 1 })).toEqual({
      text: "",
      refs: [],
      omitted: 0,
      truncated: false,
    });
  });

  test("ignored nodes contribute neither lines nor refs", () => {
    const snapshot = buildLensSnapshot(
      [
        node({ nodeId: "1", role: { value: "RootWebArea" }, childIds: ["2"] }),
        node({
          nodeId: "2",
          role: { value: "button" },
          name: { value: "Hidden" },
          backendDOMNodeId: 2,
          ignored: true,
        }),
      ],
      { documentGeneration: 1 },
    );
    expect(snapshot.refs).toHaveLength(0);
    expect(snapshot.text).not.toContain("Hidden");
  });

  test("a name is collapsed and bounded rather than dumped", () => {
    const snapshot = buildLensSnapshot(
      [
        node({
          nodeId: "1",
          role: { value: "button" },
          name: { value: `  ${"x".repeat(400)}\n\n  y  ` },
          backendDOMNodeId: 1,
        }),
      ],
      { documentGeneration: 1 },
    );
    const line = snapshot.text;
    expect(line).toContain("…");
    expect(line).not.toContain("\n");
    expect(line.length).toBeLessThan(220);
  });
});
