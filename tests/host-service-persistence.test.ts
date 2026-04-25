import { describe, expect, it } from "bun:test";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  resolveHostServiceUserDataPath,
} from "../electron/host-service/persistence";

describe("resolveHostServiceUserDataPath", () => {
  it("prefers the configured STAVE_USER_DATA_PATH", () => {
    const resolved = resolveHostServiceUserDataPath({
      STAVE_USER_DATA_PATH: "./tmp/custom-user-data",
    });

    expect(resolved).toBe(path.resolve("./tmp/custom-user-data"));
  });

  it("falls back to a tmpdir-based host-service path", () => {
    const resolved = resolveHostServiceUserDataPath({});

    expect(resolved).toBe(path.join(tmpdir(), "stave-host-service"));
  });
});
