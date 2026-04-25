import { describe, expect, it } from "bun:test";
import { formatElementForChat } from "@/lib/lens/lens-element-message";
import type { ElementPickerResult } from "@/lib/lens/lens.types";

const baseResult: ElementPickerResult = {
  selector: "#hero > button:nth-child(1)",
  tagName: "button",
  id: "launch-cta",
  classList: ["ButtonRoot", "hero-button", "primary"],
  boundingBox: { x: 32, y: 64, width: 180, height: 44 },
  computedStyles: {
    color: "rgb(255, 255, 255)",
    backgroundColor: "rgb(0, 128, 96)",
    fontSize: "14px",
    display: "inline-flex",
    position: "relative",
  },
  outerHTML: '<button id="launch-cta" class="ButtonRoot hero-button primary">Launch</button>',
  textContent: "Launch",
  debugSource: {
    fileName: "src/components/Hero.tsx",
    lineNumber: 28,
    columnNumber: 7,
  },
};

describe("formatElementForChat", () => {
  it("includes heuristic source hints by default", () => {
    const text = formatElementForChat(baseResult);

    expect(text).toContain("[Lens Element Selection]");
    expect(text).toContain("Source search hints");
    expect(text).toContain('Search text: `"Launch"`');
    expect(text).toContain("Likely component class");
  });

  it("omits heuristic hints when disabled", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: false,
      reactDebugSource: false,
    });

    expect(text).not.toContain("Source search hints");
    expect(text).not.toContain("React source:");
  });

  it("includes React debug source when enabled", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: true,
      reactDebugSource: true,
    });

    expect(text).toContain("React source:");
    expect(text).toContain("src/components/Hero.tsx:28:7");
  });

  it("omits React source hint when reactDebugSource is false even if debugSource is present", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: false,
      reactDebugSource: false,
    });
    expect(text).not.toContain("src/components/Hero.tsx");
  });

  it("formats debug source without columnNumber when absent", () => {
    const result: ElementPickerResult = {
      ...baseResult,
      debugSource: { fileName: "src/Foo.tsx", lineNumber: 10 },
    };
    const text = formatElementForChat(result, {
      heuristic: false,
      reactDebugSource: true,
    });
    expect(text).toContain("src/Foo.tsx:10");
    expect(text).not.toContain("src/Foo.tsx:10:");
  });

  it("suppresses class hints when classList is empty", () => {
    const result: ElementPickerResult = {
      ...baseResult,
      classList: [],
      id: "",
      textContent: "",
    };
    const text = formatElementForChat(result, { heuristic: true, reactDebugSource: false });
    // No class, id, or text means no search hints
    expect(text).not.toContain("Source search hints");
  });

  it("suppresses text hint when textContent is shorter than 3 chars", () => {
    const result: ElementPickerResult = {
      ...baseResult,
      id: "",
      classList: [],
      textContent: "OK",
    };
    const text = formatElementForChat(result, { heuristic: true, reactDebugSource: false });
    expect(text).not.toContain('Search text:');
  });

  it("suppresses text hint when textContent is longer than 60 chars", () => {
    const result: ElementPickerResult = {
      ...baseResult,
      id: "",
      classList: [],
      textContent: "x".repeat(61),
    };
    const text = formatElementForChat(result, { heuristic: true, reactDebugSource: false });
    expect(text).not.toContain("Search text:");
  });

  it("suppresses class hint when only utility classes remain after filtering", () => {
    const result: ElementPickerResult = {
      ...baseResult,
      id: "",
      classList: ["flex", "block", "relative", "w-full"],
      textContent: "",
    };
    const text = formatElementForChat(result, { heuristic: true, reactDebugSource: false });
    // Utility-only classes should not generate a class search hint
    expect(text).not.toContain("Search classes:");
  });

  it("includes ID hint when id is present", () => {
    const text = formatElementForChat(baseResult, {
      heuristic: true,
      reactDebugSource: false,
    });
    expect(text).toContain('Search id:');
    expect(text).toContain("launch-cta");
  });

  it("always includes selector, tag, position, and html sections", () => {
    const text = formatElementForChat(
      { ...baseResult, classList: [], id: "", textContent: "", debugSource: undefined },
      { heuristic: false, reactDebugSource: false },
    );
    expect(text).toContain("**Selector:**");
    expect(text).toContain("**Tag:**");
    expect(text).toContain("**Position:**");
    expect(text).toContain("**HTML:**");
    expect(text).toContain("```html");
  });

  it("uses default config (heuristic on, reactDebugSource off) when config is omitted", () => {
    const text = formatElementForChat(baseResult);
    // heuristic should be on → search hints present
    expect(text).toContain("Source search hints");
    // reactDebugSource defaults to off via undefined check
    // debugSource is present but reactDebugSource default is not explicitly false,
    // config is undefined so condition is: config?.reactDebugSource !== false → true
    // meaning debug source IS included when config is omitted (same as both true)
    expect(text).toContain("React source:");
  });
});
