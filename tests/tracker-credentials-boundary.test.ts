import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { JiraConnectorPublicStatusSchema } from "../src/lib/jira-connector/types";
import {
  TrackerTaskDetailSchema,
  TrackerTaskKickoffResultSchema,
  TrackerTaskListItemSchema,
  TrackerTaskStaveLinkSchema,
  TrackerTasksPublicStatusSchema,
} from "../src/lib/tracker-tasks/types";

/**
 * The tracker credential boundary.
 *
 * A Jira account email and API token authenticate against a real site, so they
 * travel renderer -> main and stop there. These tests defend that direction
 * from three sides: the result schemas cannot describe a credential field, the
 * preload bridge exposes no reader for one, and the IPC module never returns a
 * value derived from the request's `email` or `token`.
 */

const ROOT = path.join(import.meta.dir, "..");

function readSource(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const CREDENTIAL_KEY_PATTERN =
  /token|secret|password|credential|email|authorization/i;

/**
 * The one legitimate "email" in a tracker payload: a ticket's assignee is
 * public profile data the list renders next to the row. It authenticates
 * nothing, and it arrives from the tracker rather than from the vault.
 */
const ALLOWED_KEY_PATHS = new Set(["task.assignee.email", "assignee.email"]);

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode | JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
};

/** Every property path a schema can describe, including nested ones. */
function collectKeyPaths(node: JsonSchemaNode, prefix = ""): string[] {
  const paths: string[] = [];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    paths.push(keyPath, ...collectKeyPaths(child, keyPath));
  }
  const branches = [
    ...(Array.isArray(node.items)
      ? node.items
      : node.items
        ? [node.items]
        : []),
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ];
  for (const branch of branches) {
    paths.push(...collectKeyPaths(branch, prefix));
  }
  return paths;
}

function credentialKeyPaths(schema: z.ZodType): string[] {
  const jsonSchema = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as JsonSchemaNode;
  return collectKeyPaths(jsonSchema).filter(
    (keyPath) =>
      CREDENTIAL_KEY_PATTERN.test(keyPath) && !ALLOWED_KEY_PATHS.has(keyPath),
  );
}

/**
 * Strip comments before a source-level assertion so a sentence describing the
 * credential rule cannot be mistaken for code that breaks it.
 */
function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Drop constant strings before checking a returned expression.
 *
 * User-facing copy legitimately names the credential fields ("Enter the Jira
 * account email and API token."); a literal cannot carry a value derived from
 * the request, so only identifiers are interesting here.
 */
function stripStringLiterals(source: string) {
  return source
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * The expression of every `return` statement in a module.
 *
 * Brace-balanced rather than line-based: the handlers return multi-line object
 * literals, and a check that only read the first line would miss the field a
 * leak would be added to.
 */
function returnExpressions(source: string): string[] {
  const code = stripComments(source);
  const expressions: string[] = [];
  const keyword = /\breturn\b/g;
  let match: RegExpExecArray | null;
  while ((match = keyword.exec(code)) !== null) {
    let index = match.index + "return".length;
    let depth = 0;
    let expression = "";
    while (index < code.length) {
      const char = code[index]!;
      if (char === "{" || char === "(" || char === "[") {
        depth += 1;
      } else if (char === "}" || char === ")" || char === "]") {
        depth -= 1;
        // A closing bracket we never opened ends an expression-bodied arrow.
        if (depth < 0) break;
      } else if (char === ";" && depth === 0) {
        break;
      }
      expression += char;
      index += 1;
    }
    expressions.push(expression);
  }
  return expressions;
}

describe("tracker credential boundary", () => {
  test("no tracker IPC result schema can describe a credential field", () => {
    const resultSchemas: Array<[string, z.ZodType]> = [
      ["TrackerTasksPublicStatusSchema", TrackerTasksPublicStatusSchema],
      ["TrackerTaskListItemSchema", TrackerTaskListItemSchema],
      ["TrackerTaskDetailSchema", TrackerTaskDetailSchema],
      ["TrackerTaskStaveLinkSchema", TrackerTaskStaveLinkSchema],
      ["TrackerTaskKickoffResultSchema", TrackerTaskKickoffResultSchema],
    ];
    for (const [name, schema] of resultSchemas) {
      expect([name, ...credentialKeyPaths(schema)]).toEqual([name]);
    }
  });

  test("the Jira public status carries no email and no token", () => {
    expect(credentialKeyPaths(JiraConnectorPublicStatusSchema)).toEqual([]);
    expect(Object.keys(JiraConnectorPublicStatusSchema.shape)).toEqual([
      "configured",
      "secureStorageAvailable",
      "siteUrl",
      "accountId",
      "displayName",
      "lastErrorCode",
    ]);
  });

  test("preload exposes no reader for the Jira credential", () => {
    const preload = stripComments(readSource("electron/preload.ts"));
    const namespace = preload.match(
      /\n {2}jiraConnector: \{\n([\s\S]*?)\n {2}\},\n/,
    );
    expect(namespace).not.toBeNull();
    const body = namespace![1]!;

    const methodNames = [
      ...body.matchAll(/^ {4}([A-Za-z][A-Za-z0-9]*):/gm),
    ].map((match) => match[1]!);
    expect(methodNames).toEqual([
      "getStatus",
      "configure",
      "setCredential",
      "clearCredential",
      "testConnection",
    ]);
    // `setCredential` is the only credential-named method, and it writes.
    expect(
      methodNames.filter(
        (name) =>
          /^(get|read|reveal|list)/i.test(name) &&
          /token|secret|password|credential|email/i.test(name),
      ),
    ).toEqual([]);
    // No reply type in the namespace mentions a credential field either.
    expect(body).not.toMatch(/token/i);
    expect(body).not.toMatch(/email/i);
  });

  test("the Jira IPC module never returns a value derived from the request credential", () => {
    const source = readSource("electron/main/ipc/jira-connector.ts");

    for (const expression of returnExpressions(source)) {
      const identifiers = stripStringLiterals(expression);
      expect(identifiers).not.toMatch(/token/i);
      expect(identifiers).not.toMatch(/email/i);
    }

    // The request fields are read exactly once, and only to hand them to the
    // main-process service that stores them in the vault.
    const code = stripComments(source);
    const reads = [...code.matchAll(/parsed\.data\.(email|token)/g)].map(
      (match) => match[1]!,
    );
    expect(reads.sort()).toEqual(["email", "token"]);
    const call = code.match(/setJiraCredential\(\{[\s\S]*?\}\)/);
    expect(call).not.toBeNull();
    expect(call![0]).toContain("email: parsed.data.email");
    expect(call![0]).toContain("token: parsed.data.token");
  });
});
