import { describe, expect, test } from "bun:test";
import {
  JSON_TREE_MAX_CHARS,
  initialJsonOpenDepth,
  jsonTreeForFence,
  parseJsonTree,
} from "@/lib/markdown/json-tree";
import { richFenceFor } from "@/lib/markdown/rich-fence";

describe("parseJsonTree", () => {
  test("reads objects and arrays with every value kind", () => {
    const document = parseJsonTree('{"a": [1, "two", true, null], "b": {}}');
    expect(document?.root).toEqual({
      kind: "object",
      entries: [
        {
          key: "a",
          value: {
            kind: "array",
            items: [
              { kind: "number", raw: "1" },
              { kind: "string", value: "two" },
              { kind: "boolean", value: true },
              { kind: "null" },
            ],
          },
        },
        { key: "b", value: { kind: "object", entries: [] } },
      ],
    });
    expect(document?.nodeCount).toBe(7);
  });

  test("keeps key order and big integers exactly as written", () => {
    const document = parseJsonTree('{"b": 1, "2": 2, "1": 12345678901234567890}');
    if (document?.root.kind !== "object") throw new Error("not an object");
    expect(document.root.entries.map((entry) => entry.key)).toEqual(["b", "2", "1"]);
    expect(document.root.entries[2]?.value).toEqual({ kind: "number", raw: "12345678901234567890" });
  });

  test("decodes string escapes", () => {
    const document = parseJsonTree('["tab\\tquote\\" \\u00e9"]');
    expect(document?.root).toEqual({ kind: "array", items: [{ kind: "string", value: 'tab\tquote" é' }] });
  });

  test("rejects invalid JSON, scalars and bodies past the size cap", () => {
    expect(parseJsonTree('{"a": 1,}')).toBeNull();
    expect(parseJsonTree("[1, 2")).toBeNull();
    expect(parseJsonTree("{a: 1}")).toBeNull();
    expect(parseJsonTree('{"a": 1} trailing')).toBeNull();
    expect(parseJsonTree('"just a string"')).toBeNull();
    expect(parseJsonTree("42")).toBeNull();
    expect(parseJsonTree(`[${'"x",'.repeat(JSON_TREE_MAX_CHARS / 4)}"x"]`)).toBeNull();
  });

  test("rejects nesting deeper than the limit instead of overflowing the stack", () => {
    expect(parseJsonTree(`${"[".repeat(10_000)}${"]".repeat(10_000)}`)).toBeNull();
    expect(parseJsonTree(`${"[".repeat(100)}${"]".repeat(100)}`)).not.toBeNull();
  });

  test("opens small documents fully and large ones only near the root", () => {
    const small = parseJsonTree("[1, 2, 3]")!;
    const large = parseJsonTree(`[${Array.from({ length: 3_000 }, (_, index) => index).join(",")}]`)!;
    expect(initialJsonOpenDepth(small)).toBe(Number.POSITIVE_INFINITY);
    expect(initialJsonOpenDepth(large)).toBe(1);
  });
});

describe("JSON fences", () => {
  test("a json fence or an untagged object becomes a tree; other languages stay code", () => {
    expect(jsonTreeForFence("json", '{"a": 1}')).not.toBeNull();
    expect(jsonTreeForFence("JSON", "[1]")).not.toBeNull();
    expect(jsonTreeForFence(undefined, '{"a": 1}')).not.toBeNull();
    expect(jsonTreeForFence("ts", '{"a": 1}')).toBeNull();
    expect(jsonTreeForFence(undefined, "function f() {}")).toBeNull();
    expect(jsonTreeForFence("json", "{ not json }")).toBeNull();
  });

  test("richFenceFor picks a tree, terminal output or nothing", () => {
    expect(richFenceFor("json", '{"a": 1}')?.kind).toBe("json");
    expect(richFenceFor("console", "$ ls")?.kind).toBe("terminal");
    expect(richFenceFor("ts", "const a = 1;")).toBeNull();
    expect(richFenceFor("json", "{ broken")).toBeNull();
  });
});
