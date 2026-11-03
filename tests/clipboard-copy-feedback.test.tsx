import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ClipboardCopyAnnouncement } from "@/components/system/ClipboardCopyAnnouncement";
import { copyTextWithFeedback, copyTextWithToasts } from "@/hooks/use-clipboard-copy";
import { toast } from "@/lib/notifications/toast";

const originalNavigator = globalThis.navigator;

function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText } },
  });
}

describe("copying with feedback", () => {
  let errorSpy: ReturnType<typeof spyOn>;
  let successSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    errorSpy = spyOn(toast, "error").mockImplementation(() => "toast");
    successSpy = spyOn(toast, "success").mockImplementation(() => "toast");
  });

  afterEach(() => {
    errorSpy.mockRestore();
    successSpy.mockRestore();
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    applyAppLocale("en");
  });

  test("a refused clipboard raises one error toast instead of failing silently", async () => {
    setClipboard(() => Promise.reject(new Error("denied")));
    await expect(copyTextWithFeedback("hello")).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe("Couldn't copy to the clipboard");
  });

  test("a copy that lands raises no error", async () => {
    const written: string[] = [];
    setClipboard(async (value) => {
      written.push(value);
    });
    await expect(copyTextWithFeedback("hello")).resolves.toBe(true);
    expect(written).toEqual(["hello"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("menu copies confirm a landed copy and report a refused one", async () => {
    setClipboard(async () => {});
    await copyTextWithToasts("abc123", "Commit hash copied");
    expect(successSpy).toHaveBeenCalledWith("Commit hash copied");
    setClipboard(() => Promise.reject(new Error("denied")));
    await copyTextWithToasts("abc123", "Commit hash copied");
    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("the error toast follows the app language", async () => {
    applyAppLocale("ko");
    setClipboard(() => Promise.reject(new Error("denied")));
    await copyTextWithFeedback("hello");
    expect(errorSpy.mock.calls[0]?.[0]).toBe("클립보드에 복사하지 못했습니다");
  });
});

describe("copy announcement", () => {
  afterEach(() => {
    applyAppLocale("en");
  });

  const render = (status: "idle" | "copied" | "failed") =>
    renderToStaticMarkup(createElement(ClipboardCopyAnnouncement, { status }));

  test("is a polite status region that says either outcome", () => {
    expect(render("idle")).toMatch(/role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*><\/span>/);
    expect(render("copied")).toContain(">Copied<");
    expect(render("failed")).toContain(">Couldn&#x27;t copy to the clipboard<");
    applyAppLocale("ko");
    expect(render("copied")).toContain(">복사됨<");
  });
});
