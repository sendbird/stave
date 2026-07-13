import { describe, expect, test } from "bun:test";
import {
  buildAutoMergePullRequestArgs,
  buildCreatePullRequestArgs,
  buildCreateTagArgs,
} from "../electron/host-service/scm-runtime";

describe("buildCreatePullRequestArgs", () => {
  test("creates a ready PR with the selected title, body, and base", () => {
    expect(buildCreatePullRequestArgs({
      title: "fix(pr): align create flow",
      body: "## Summary\n- Align the flow.",
      baseBranch: "main",
      draft: false,
    })).toEqual([
      "pr",
      "create",
      "--title",
      "fix(pr): align create flow",
      "--body",
      "## Summary\n- Align the flow.",
      "--base",
      "main",
    ]);
  });
});

describe("buildAutoMergePullRequestArgs", () => {
  test("lets GitHub select the repository default merge strategy", () => {
    expect(buildAutoMergePullRequestArgs()).toEqual([
      "pr",
      "merge",
      "--auto",
      "--delete-branch",
    ]);
  });

  test("supports the configured merge strategy", () => {
    expect(buildAutoMergePullRequestArgs("rebase")).toEqual([
      "pr",
      "merge",
      "--auto",
      "--rebase",
      "--delete-branch",
    ]);
  });
});

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
