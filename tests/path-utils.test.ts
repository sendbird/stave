import { describe, expect, test } from "bun:test";
import { isAbsolutePosixOrWindowsPath } from "@/lib/path-utils";

describe("isAbsolutePosixOrWindowsPath", () => {
  test("accepts a posix absolute path", () => {
    expect(isAbsolutePosixOrWindowsPath("/tmp/downloads")).toBe(true);
  });

  test("accepts a windows absolute path with either separator", () => {
    expect(isAbsolutePosixOrWindowsPath("C:\\Users\\me")).toBe(true);
    expect(isAbsolutePosixOrWindowsPath("D:/projects")).toBe(true);
  });

  test("rejects relative and empty paths", () => {
    expect(isAbsolutePosixOrWindowsPath("./relative")).toBe(false);
    expect(isAbsolutePosixOrWindowsPath("relative")).toBe(false);
    expect(isAbsolutePosixOrWindowsPath("")).toBe(false);
  });

  test("rejects a bare drive letter without a separator", () => {
    expect(isAbsolutePosixOrWindowsPath("C:")).toBe(false);
  });
});
