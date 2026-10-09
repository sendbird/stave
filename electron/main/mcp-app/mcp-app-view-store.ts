import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { splitInlineRenderId } from "../../../src/lib/inline-render/inline-render";
import {
  normalizeMcpAppCsp,
  type McpAppCsp,
} from "../../../src/lib/mcp-app/mcp-app-csp";
import {
  MCP_APP_MAX_HTML_BYTES,
  normalizeMcpAppToolInput,
  normalizeMcpAppToolResult,
  normalizeMcpAppToolDescriptors,
  type McpAppPermissions,
  type McpAppToolDescriptor,
  type McpAppViewProvider,
  type McpAppViewReference,
} from "../../../src/lib/mcp-app/mcp-app-view";
import { inlineRenderWorkspaceKey } from "../inline-render/inline-render-store";

/**
 * MCP App views on disk, captured when the tool call completed:
 * `<root>/<workspace key>/<uuid>.html` holds the view exactly as the server
 * returned it, and `<uuid>.json` what the view needs later — its declared CSP
 * and permissions, the call's input and result, the server's app-visible
 * tools, and how to reach the server again. Capture happens at call time
 * because a resumed conversation's history may no longer carry the tool's
 * metadata.
 *
 * The provider runtimes (host service) write views and the main process
 * serves them, so both resolve the same root from the user data path.
 */

export interface McpAppViewRecord {
  version: 1;
  viewId: string;
  provider: McpAppViewProvider;
  server: string;
  tool: string;
  resourceUri: string;
  toolUseId: string;
  taskId: string | null;
  /** Codex: the thread the call ran in, for proxied view requests. */
  threadId: string | null;
  /** Codex: the App Server executable and account that made the call. */
  executablePath: string | null;
  accountProfileId: string | null;
  csp: McpAppCsp;
  permissions: McpAppPermissions;
  prefersBorder: boolean | null;
  appTools: McpAppToolDescriptor[];
  toolInput: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  createdAt: string;
}

export type McpAppViewPublishInput = Omit<McpAppViewRecord, "version" | "viewId" | "createdAt"> & {
  workspaceId: string | null;
  html: string;
};

export interface McpAppViewStore {
  publish(input: McpAppViewPublishInput): Promise<McpAppViewReference>;
  read(viewId: string): Promise<{ html: string; record: McpAppViewRecord } | null>;
  describe(viewId: string): Promise<McpAppViewRecord | null>;
  removeWorkspace(workspaceId: string): Promise<void>;
}

/** `<user data>/mcp-app-views`, the same directory in main and the host service. */
export function resolveMcpAppViewRootDir(env: NodeJS.ProcessEnv = process.env): string {
  const userData = env.STAVE_USER_DATA_PATH?.trim();
  return path.join(
    userData ? path.resolve(userData) : path.join(tmpdir(), "stave-host-service"),
    "mcp-app-views",
  );
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readPermissions(value: unknown): McpAppPermissions {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const permissions: McpAppPermissions = {};
  for (const key of ["camera", "microphone", "geolocation", "clipboardWrite"] as const) {
    if (record[key] === true) permissions[key] = true;
  }
  return permissions;
}

function normalizeRecord(viewId: string, parsed: Partial<McpAppViewRecord>): McpAppViewRecord | null {
  if (parsed.viewId !== viewId) return null;
  if (parsed.provider !== "codex" && parsed.provider !== "claude-code") return null;
  const server = readString(parsed.server);
  const tool = readString(parsed.tool);
  const resourceUri = readString(parsed.resourceUri);
  if (!server || !tool || !resourceUri) return null;
  return {
    version: 1,
    viewId,
    provider: parsed.provider,
    server,
    tool,
    resourceUri,
    toolUseId: readString(parsed.toolUseId) ?? "",
    taskId: readString(parsed.taskId),
    threadId: readString(parsed.threadId),
    executablePath: readString(parsed.executablePath),
    accountProfileId: readString(parsed.accountProfileId),
    csp: normalizeMcpAppCsp(parsed.csp),
    permissions: readPermissions(parsed.permissions),
    prefersBorder: typeof parsed.prefersBorder === "boolean" ? parsed.prefersBorder : null,
    appTools: normalizeMcpAppToolDescriptors(parsed.appTools),
    toolInput: normalizeMcpAppToolInput(parsed.toolInput),
    toolResult: normalizeMcpAppToolResult(parsed.toolResult),
    createdAt: readString(parsed.createdAt) ?? "",
  };
}

export function createMcpAppViewStore(args: { rootDir: () => string }): McpAppViewStore {
  function locate(viewId: string) {
    const parts = splitInlineRenderId(viewId);
    if (!parts) return null;
    const dir = path.join(args.rootDir(), parts.workspaceKey);
    return {
      dir,
      htmlPath: path.join(dir, `${parts.fileId}.html`),
      recordPath: path.join(dir, `${parts.fileId}.json`),
    };
  }

  async function writeAtomically(filePath: string, content: string) {
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, "utf8");
    try {
      await rename(temporary, filePath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async function describe(viewId: string): Promise<McpAppViewRecord | null> {
    const location = locate(viewId);
    if (!location) return null;
    try {
      return normalizeRecord(
        viewId,
        JSON.parse(await readFile(location.recordPath, "utf8")) as Partial<McpAppViewRecord>,
      );
    } catch {
      return null;
    }
  }

  return {
    async publish(input) {
      if (input.html.length === 0 || Buffer.byteLength(input.html, "utf8") > MCP_APP_MAX_HTML_BYTES) {
        throw new Error(`An MCP App view must be between 1 and ${MCP_APP_MAX_HTML_BYTES} bytes.`);
      }
      const viewId = `${inlineRenderWorkspaceKey(input.workspaceId)}-${randomUUID()}`;
      const location = locate(viewId);
      if (!location) throw new Error("Could not allocate an MCP App view id.");
      const { html: _html, workspaceId: _workspaceId, ...fields } = input;
      const record = normalizeRecord(viewId, {
        ...fields,
        version: 1,
        viewId,
        createdAt: new Date().toISOString(),
      });
      if (!record) throw new Error("The MCP App view record is incomplete.");
      await mkdir(location.dir, { recursive: true });
      await writeAtomically(location.htmlPath, input.html);
      try {
        await writeAtomically(location.recordPath, JSON.stringify(record));
      } catch (error) {
        await rm(location.htmlPath, { force: true });
        throw error;
      }
      return {
        version: 1,
        viewId,
        provider: record.provider,
        server: record.server,
        tool: record.tool,
        resourceUri: record.resourceUri,
      };
    },

    async read(viewId) {
      const location = locate(viewId);
      if (!location) return null;
      const record = await describe(viewId);
      if (!record) return null;
      try {
        return { html: await readFile(location.htmlPath, "utf8"), record };
      } catch {
        return null;
      }
    },

    describe,

    async removeWorkspace(workspaceId) {
      await rm(path.join(args.rootDir(), inlineRenderWorkspaceKey(workspaceId)), {
        recursive: true,
        force: true,
      });
    },
  };
}

let sharedStore: McpAppViewStore | null = null;

/** The store under the user data directory, shared by every caller in a process. */
export function getMcpAppViewStore(): McpAppViewStore {
  sharedStore ??= createMcpAppViewStore({ rootDir: () => resolveMcpAppViewRootDir() });
  return sharedStore;
}
