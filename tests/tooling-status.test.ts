import { describe, expect, test } from "bun:test";
import {
  parseAheadBehindCounts,
  parseClaudeAuthState,
  parseCodexAuthState,
  parseCodexMcpServerList,
  parseCursorAuthState,
  parseGhAuthState,
  parseKiroAuthState,
} from "../electron/main/utils/tooling-status";

describe("tooling status helpers", () => {
  test("parses ahead/behind counts from git rev-list output", () => {
    expect(parseAheadBehindCounts({ stdout: "3\t7\n" })).toEqual({
      ahead: 3,
      behind: 7,
    });
  });

  test("derives authenticated GitHub CLI state from gh auth status output", () => {
    expect(parseGhAuthState({
      ok: true,
      stdout: "github.com\n  ✓ Logged in to github.com account demo (keyring)\n",
      stderr: "",
    })).toEqual({
      authState: "authenticated",
      authDetail: "github.com\n  ✓ Logged in to github.com account demo (keyring)",
    });
  });

  test("derives Codex login requirement from login status failure output", () => {
    expect(parseCodexAuthState({
      ok: false,
      stdout: "",
      stderr: "Not logged in. Run `codex login` first.",
    })).toEqual({
      authState: "unauthenticated",
      authDetail: "Not logged in. Run `codex login` first.",
    });
  });

  test("recognizes successful Codex API key authentication", () => {
    expect(parseCodexAuthState({
      ok: true,
      stdout: "",
      stderr: "Logged in using an API key - fixture",
    }).authState).toBe("authenticated");
  });

  test.each([
    ["Claude", parseClaudeAuthState],
    ["Codex", parseCodexAuthState],
    ["Cursor", parseCursorAuthState],
    ["Kiro", parseKiroAuthState],
  ] as const)(
    "keeps %s probe failures distinct from missing login",
    (_provider, parse) => {
      for (const stderr of [
        "Temporary service unavailable",
        "Error reading credential store",
        "",
      ]) {
        expect(parse({ ok: false, stdout: "", stderr }).authState).toBe("unknown");
      }
    },
  );

  test("parses Claude auth status JSON", () => {
    expect(parseClaudeAuthState({
      ok: true,
      stdout: JSON.stringify({
        loggedIn: true,
        email: "dev@example.com",
        orgName: "Acme",
      }),
      stderr: "",
    })).toEqual({
      authState: "authenticated",
      authDetail: "Authenticated · dev@example.com · org: Acme",
    });
  });

  test("parses Claude auth status JSON with a warning preamble", () => {
    expect(parseClaudeAuthState({
      ok: true,
      stdout: `WARNING: stale symlink detected
{"loggedIn":true,"email":"dev@example.com","orgName":"Acme"}`,
      stderr: "",
    })).toEqual({
      authState: "authenticated",
      authDetail: "Authenticated · dev@example.com · org: Acme",
    });
  });

  test("parses Claude auth status JSON when the CLI reports logged out", () => {
    expect(parseClaudeAuthState({
      ok: false,
      stdout: JSON.stringify({
        loggedIn: false,
        authMethod: "none",
      }),
      stderr: "",
    })).toEqual({
      authState: "unauthenticated",
      authDetail: "Not authenticated",
    });
  });

  test("recognizes Cursor Agent login without retaining account output", () => {
    expect(
      parseCursorAuthState({
        ok: true,
        stdout: "Logged in as person@example.com",
        stderr: "",
      }),
    ).toEqual({
      authState: "authenticated",
      authDetail: "Cursor Agent CLI is authenticated.",
    });
  });

  test("recognizes a Cursor Agent login requirement", () => {
    expect(
      parseCursorAuthState({
        ok: false,
        stdout: "",
        stderr: "Not logged in. Run `agent login`.",
      }),
    ).toEqual({
      authState: "unauthenticated",
      authDetail: "Cursor Agent CLI login is required.",
    });
  });

  test("recognizes Kiro login without retaining account output", () => {
    expect(
      parseKiroAuthState({
        ok: true,
        stdout: "Authenticated as person@example.com",
        stderr: "",
      }),
    ).toEqual({
      authState: "authenticated",
      authDetail: "Kiro CLI is authenticated.",
    });
  });

  test("recognizes a Kiro login requirement", () => {
    expect(
      parseKiroAuthState({
        ok: false,
        stdout: "",
        stderr: "Not logged in. Run `kiro-cli login`.",
      }),
    ).toEqual({
      authState: "unauthenticated",
      authDetail: "Kiro CLI login is required.",
    });
  });

  test("parses Codex MCP JSON output with warning preamble", () => {
    expect(parseCodexMcpServerList({
      stdout: "",
      stderr: `WARNING: proceeding, even though we could not update PATH: Operation not permitted (os error 1)
[
  {
    "name": "stave-local",
    "enabled": true,
    "disabled_reason": null,
    "transport": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:64281/mcp",
      "bearer_token_env_var": "STAVE_LOCAL_MCP_TOKEN"
    },
    "startup_timeout_sec": null,
    "tool_timeout_sec": null,
    "auth_status": "bearer_token"
  }
]`,
    })).toEqual([
      {
        name: "stave-local",
        enabled: true,
        disabledReason: null,
        transportType: "streamable_http",
        url: "http://127.0.0.1:64281/mcp",
        bearerTokenEnvVar: "STAVE_LOCAL_MCP_TOKEN",
        authStatus: "bearer_token",
        startupTimeoutSec: null,
        toolTimeoutSec: null,
      },
    ]);
  });
});
