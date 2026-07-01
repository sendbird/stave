import { describe, expect, test } from "bun:test";
import { buildCreateTagArgs } from "../electron/host-service/scm-runtime";

describe("buildCreateTagArgs", () => {
  test("lightweight tag uses --no-sign so tag.gpgsign config can't force a message", () => {
    // Regression: with `tag.gpgsign=true` in git config, a bare `git tag <name>`
    // is treated as a signed/annotated tag and fails with "fatal: no tag message?".
    // The UI collects only a name, so it must create a lightweight tag explicitly.
    expect(buildCreateTagArgs({ name: "v1.0.0", commit: "abc123" })).toEqual([
      "tag",
      "--no-sign",
      "v1.0.0",
      "abc123",
    ]);
  });

  test("lightweight tag without a target ref", () => {
    expect(buildCreateTagArgs({ name: "v1.0.0" })).toEqual([
      "tag",
      "--no-sign",
      "v1.0.0",
    ]);
  });

  test("annotated tag with a message keeps -a/-m and does not force --no-sign", () => {
    expect(
      buildCreateTagArgs({
        name: "v1.0.0",
        message: "release",
        commit: "abc123",
      }),
    ).toEqual(["tag", "-a", "v1.0.0", "-m", "release", "abc123"]);
  });

  test("trims name, message, and target", () => {
    expect(
      buildCreateTagArgs({
        name: "  v1.0.0  ",
        message: "  ",
        commit: "  abc123  ",
      }),
    ).toEqual(["tag", "--no-sign", "v1.0.0", "abc123"]);
  });
});
