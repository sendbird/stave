import { describe, expect, test } from "bun:test";
import { MCP_APP_VIEW_COOKIE_JAR_SOURCE, MCP_APP_VIEW_DOCUMENT_PRELUDE } from "@/lib/mcp-app/mcp-app-view-document";

/** A document as a view's sandbox presents it: touching `cookie` throws. */
function sandboxedDocument(): { cookie: string } {
  const refuse = () => {
    throw new DOMException("The document is sandboxed.", "SecurityError");
  };
  return Object.create(
    Object.defineProperty({}, "cookie", {
      configurable: true,
      get: refuse,
      set: refuse,
    }),
  );
}

function runPrelude(document: object) {
  new Function("document", MCP_APP_VIEW_COOKIE_JAR_SOURCE)(document);
}

describe("MCP App view document prelude", () => {
  test("a sandboxed document throws on cookies until the prelude runs", () => {
    const document = sandboxedDocument();
    expect(() => document.cookie).toThrow("sandboxed");
    runPrelude(document);
    expect(document.cookie).toBe("");
  });

  // The failure this guards: a view draws, reports its height, then looks a
  // cookie up without a guard. The uncaught error took its whole UI down and
  // left an empty frame as tall as what it had drawn.
  test("looking up a cookie that was never set finds nothing instead of throwing", () => {
    const document = sandboxedDocument();
    runPrelude(document);
    const lookUp = (name: string) => document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
    expect(lookUp("session")).toBeUndefined();
  });

  test("keeps what the view writes, as name=value pairs in the order written", () => {
    const document = sandboxedDocument();
    runPrelude(document);
    document.cookie = "theme=dark; path=/; SameSite=Lax";
    document.cookie = "visit=1; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/";
    document.cookie = "theme=light";
    expect(document.cookie).toBe("theme=light; visit=1");
  });

  test("removes a cookie written as expired", () => {
    const document = sandboxedDocument();
    runPrelude(document);
    document.cookie = "a=1";
    document.cookie = "b=2";
    document.cookie = "c=3";
    document.cookie = "a=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "b=; Max-Age=0";
    // Max-Age wins over Expires when both are given.
    document.cookie = "c=3; Max-Age=60; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    expect(document.cookie).toBe("c=3");
  });

  test("values keep their own equals signs, and an empty write changes nothing", () => {
    const document = sandboxedDocument();
    runPrelude(document);
    document.cookie = "token=a=b=c";
    document.cookie = "";
    document.cookie = "bare";
    expect(document.cookie).toBe("token=a=b=c; bare");
  });

  test("each document gets its own jar", () => {
    const first = sandboxedDocument();
    const second = sandboxedDocument();
    runPrelude(first);
    runPrelude(second);
    first.cookie = "only=first";
    expect(second.cookie).toBe("");
  });

  test("leaves a document alone where cookies already work", () => {
    const document = { cookie: "native=1" };
    runPrelude(document);
    expect(Object.getOwnPropertyDescriptor(document, "cookie")).toEqual({
      value: "native=1",
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });

  test("the prelude is one inline script that cannot end early", () => {
    expect(MCP_APP_VIEW_DOCUMENT_PRELUDE).toBe(`<script>${MCP_APP_VIEW_COOKIE_JAR_SOURCE}</script>`);
    expect(MCP_APP_VIEW_COOKIE_JAR_SOURCE).not.toContain("</");
    expect(MCP_APP_VIEW_COOKIE_JAR_SOURCE).not.toContain("<!--");
  });
});
