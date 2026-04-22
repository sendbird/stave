import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { encodeJsonRpcMessage, JsonRpcMessageBuffer } from "./jsonrpc";
import { toLspDocumentUri, toLspWorkspaceRootUri, toWorkspaceFilePathFromUri } from "./path-utils";
import { resolveLspServer, type SupportedLspLanguageId } from "./server-registry";

type SessionStatus = "starting" | "ready" | "error" | "unavailable" | "stopped";

interface LspRequestSuccess<T> {
  ok: true;
  value: T;
}

interface LspRequestFailure {
  ok: false;
  detail: string;
}

type LspRequestResult<T> = LspRequestSuccess<T> | LspRequestFailure;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface LspDocumentState {
  version: number;
  languageId: string;
}

interface LspSession {
  id: string;
  key: string;
  rootPath: string;
  languageId: SupportedLspLanguageId;
  child: ChildProcessWithoutNullStreams;
  buffer: JsonRpcMessageBuffer;
  nextRequestId: number;
  pendingRequests: Map<number, PendingRequest>;
  subscribers: Map<number, WebContents>;
  documents: Map<string, LspDocumentState>;
  status: SessionStatus;
  detail: string;
}

export interface LspEventPayload {
  type: "status" | "diagnostics";
  rootPath: string;
  languageId: SupportedLspLanguageId;
  status?: SessionStatus;
  detail?: string;
  filePath?: string;
  diagnostics?: Array<{
    severity?: number;
    message: string;
    source?: string;
    code?: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  }>;
}

const sessions = new Map<string, LspSession>();

function buildSessionKey(args: { rootPath: string; languageId: SupportedLspLanguageId }) {
  return `${args.languageId}:${args.rootPath}`;
}

function subscribeSessionToSender(session: LspSession, sender: WebContents) {
  if (session.subscribers.has(sender.id)) {
    return;
  }
  session.subscribers.set(sender.id, sender);
  sender.once("destroyed", () => {
    session.subscribers.delete(sender.id);
  });
}

function broadcastEvent(session: LspSession, payload: LspEventPayload) {
  for (const [senderId, sender] of session.subscribers) {
    if (sender.isDestroyed()) {
      session.subscribers.delete(senderId);
      continue;
    }
    sender.send("lsp:event", payload);
  }
}

function updateSessionStatus(session: LspSession, status: SessionStatus, detail: string) {
  session.status = status;
  session.detail = detail;
  broadcastEvent(session, {
    type: "status",
    rootPath: session.rootPath,
    languageId: session.languageId,
    status,
    detail,
  });
}

function writeJsonRpcMessage(session: LspSession, payload: unknown) {
  session.child.stdin.write(encodeJsonRpcMessage(payload), "utf8");
}

function sendRequest<T>(session: LspSession, method: string, params: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = session.nextRequestId;
    session.nextRequestId += 1;
    session.pendingRequests.set(id, { resolve, reject });
    writeJsonRpcMessage(session, {
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
  });
}

function sendNotification(session: LspSession, method: string, params: unknown) {
  writeJsonRpcMessage(session, {
    jsonrpc: "2.0",
    method,
    params,
  });
}

function handlePublishDiagnostics(session: LspSession, params: Record<string, unknown>) {
  const uri = typeof params.uri === "string" ? params.uri : "";
  const filePath = uri ? toWorkspaceFilePathFromUri({ rootPath: session.rootPath, uri }) : null;
  if (!filePath) {
    return;
  }
  const diagnostics = Array.isArray(params.diagnostics)
    ? params.diagnostics
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        severity: typeof item.severity === "number" ? item.severity : undefined,
        message: typeof item.message === "string" ? item.message : "Unknown diagnostic",
        source: typeof item.source === "string" ? item.source : undefined,
        code: typeof item.code === "string" || typeof item.code === "number" ? String(item.code) : undefined,
        range: {
          start: {
            line: Number((item.range as { start?: { line?: number } })?.start?.line ?? 0),
            character: Number((item.range as { start?: { character?: number } })?.start?.character ?? 0),
          },
          end: {
            line: Number((item.range as { end?: { line?: number } })?.end?.line ?? 0),
            character: Number((item.range as { end?: { character?: number } })?.end?.character ?? 0),
          },
        },
      }))
    : [];

  broadcastEvent(session, {
    type: "diagnostics",
    rootPath: session.rootPath,
    languageId: session.languageId,
    filePath,
    diagnostics,
  });
}

function handleIncomingMessage(session: LspSession, message: unknown) {
  if (!message || typeof message !== "object") {
    return;
  }
  const payload = message as {
    id?: number;
    result?: unknown;
    error?: { message?: string };
    method?: string;
    params?: Record<string, unknown>;
  };

  if (typeof payload.id === "number") {
    const pending = session.pendingRequests.get(payload.id);
    if (!pending) {
      return;
    }
    session.pendingRequests.delete(payload.id);
    if (payload.error) {
      pending.reject(new Error(payload.error.message ?? "Unknown LSP error"));
      return;
    }
    pending.resolve(payload.result);
    return;
  }

  if (payload.method === "textDocument/publishDiagnostics" && payload.params) {
    handlePublishDiagnostics(session, payload.params);
  }
}

async function initializeSession(session: LspSession) {
  const rootUri = toLspWorkspaceRootUri(session.rootPath);
  const initializeResult = await sendRequest<{ capabilities?: Record<string, unknown> }>(session, "initialize", {
    processId: process.pid,
    clientInfo: {
      name: "stave",
      version: "0.0.8",
    },
    rootUri,
    capabilities: {
      textDocument: {
        synchronization: {
          didSave: false,
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false,
        },
        hover: {
          dynamicRegistration: false,
          contentFormat: ["markdown", "plaintext"],
        },
        definition: {
          dynamicRegistration: false,
          linkSupport: true,
        },
        completion: {
          dynamicRegistration: false,
          completionItem: {
            documentationFormat: ["markdown", "plaintext"],
            snippetSupport: false,
          },
        },
      },
      workspace: {
        workspaceFolders: true,
      },
    },
    workspaceFolders: [{
      uri: rootUri,
      name: session.rootPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "workspace",
    }],
  });

  sendNotification(session, "initialized", {});
  updateSessionStatus(session, "ready", `${session.languageId} language server ready.`);
  return initializeResult;
}

async function createSession(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  commandOverride?: string;
}) {
  const key = buildSessionKey({ rootPath: args.rootPath, languageId: args.languageId });
  const resolved = resolveLspServer({
    languageId: args.languageId,
    commandOverride: args.commandOverride,
  });
  if (!resolved.ok) {
    return {
      ok: false as const,
      detail: resolved.detail,
      status: "unavailable" as const,
    };
  }

  const child = spawn(resolved.server.command, resolved.server.args, {
    cwd: args.rootPath,
    env: process.env,
    stdio: "pipe",
    shell: false,
    windowsHide: true,
  });

  const session: LspSession = {
    id: randomUUID(),
    key,
    rootPath: args.rootPath,
    languageId: args.languageId,
    child,
    buffer: new JsonRpcMessageBuffer(),
    nextRequestId: 1,
    pendingRequests: new Map(),
    subscribers: new Map(),
    documents: new Map(),
    status: "starting",
    detail: `Starting ${resolved.server.displayName}...`,
  };
  sessions.set(key, session);
  subscribeSessionToSender(session, args.sender);
  updateSessionStatus(session, "starting", session.detail);

  child.stdout.on("data", (chunk) => {
    let messages: unknown[];
    try {
      messages = session.buffer.append(chunk);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      updateSessionStatus(session, "error", detail);
      child.kill();
      return;
    }
    for (const message of messages) {
      handleIncomingMessage(session, message);
    }
  });

  child.stderr.on("data", (chunk) => {
    const message = chunk.toString("utf8").trim();
    if (!message) {
      return;
    }
    updateSessionStatus(session, session.status, message);
  });

  child.on("error", (error) => {
    updateSessionStatus(session, "error", error instanceof Error ? error.message : String(error));
  });

  child.on("exit", (code, signal) => {
    sessions.delete(key);
    for (const pending of session.pendingRequests.values()) {
      pending.reject(new Error(`LSP session exited (${code ?? "null"}${signal ? `, ${signal}` : ""}).`));
    }
    session.pendingRequests.clear();
    updateSessionStatus(
      session,
      "stopped",
      `Language server exited${code != null ? ` with code ${code}` : ""}${signal ? ` (${signal})` : ""}.`,
    );
  });

  try {
    await initializeSession(session);
    return {
      ok: true as const,
      session,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to initialize language server.";
    updateSessionStatus(session, "error", detail);
    child.kill();
    sessions.delete(key);
    return {
      ok: false as const,
      detail,
      status: "error" as const,
    };
  }
}

async function ensureSession(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  commandOverride?: string;
}) {
  const key = buildSessionKey({ rootPath: args.rootPath, languageId: args.languageId });
  const existing = sessions.get(key);
  if (existing) {
    subscribeSessionToSender(existing, args.sender);
    return {
      ok: existing.status === "ready",
      status: existing.status,
      detail: existing.detail,
      session: existing,
    };
  }

  const created = await createSession(args);
  if (!created.ok) {
    return {
      ok: false,
      status: created.status,
      detail: created.detail,
      session: null,
    };
  }

  return {
    ok: true,
    status: created.session.status,
    detail: created.session.detail,
    session: created.session,
  };
}

function getDocumentUri(args: { rootPath: string; filePath: string }) {
  return toLspDocumentUri({
    rootPath: args.rootPath,
    filePath: args.filePath,
  });
}

async function withReadySession<T>(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  commandOverride?: string;
  operation: (session: LspSession) => Promise<T>;
}): Promise<LspRequestResult<T>> {
  const ensured = await ensureSession(args);
  if (!ensured.ok || !ensured.session || ensured.session.status !== "ready") {
    return {
      ok: false,
      detail: ensured.detail,
    };
  }

  try {
    return {
      ok: true,
      value: await args.operation(ensured.session),
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "LSP request failed.",
    };
  }
}

export async function syncLspDocument(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  filePath: string;
  documentLanguageId: string;
  text: string;
  version: number;
  commandOverride?: string;
}) {
  return withReadySession({
    rootPath: args.rootPath,
    languageId: args.languageId,
    sender: args.sender,
    commandOverride: args.commandOverride,
    operation: async (session) => {
      const uri = getDocumentUri({ rootPath: args.rootPath, filePath: args.filePath });
      const existing = session.documents.get(args.filePath);
      if (!existing) {
        sendNotification(session, "textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: args.documentLanguageId,
            version: args.version,
            text: args.text,
          },
        });
        session.documents.set(args.filePath, {
          version: args.version,
          languageId: args.documentLanguageId,
        });
        return null;
      }

      if (existing.version === args.version) {
        return null;
      }

      sendNotification(session, "textDocument/didChange", {
        textDocument: {
          uri,
          version: args.version,
        },
        contentChanges: [{ text: args.text }],
      });
      session.documents.set(args.filePath, {
        version: args.version,
        languageId: args.documentLanguageId,
      });
      return null;
    },
  });
}

export async function closeLspDocument(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  filePath: string;
}) {
  return withReadySession({
    rootPath: args.rootPath,
    languageId: args.languageId,
    sender: args.sender,
    operation: async (session) => {
      if (!session.documents.has(args.filePath)) {
        return null;
      }
      sendNotification(session, "textDocument/didClose", {
        textDocument: {
          uri: getDocumentUri({ rootPath: args.rootPath, filePath: args.filePath }),
        },
      });
      session.documents.delete(args.filePath);
      return null;
    },
  });
}

export async function requestLspHover(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  filePath: string;
  line: number;
  character: number;
  commandOverride?: string;
}) {
  return withReadySession({
    rootPath: args.rootPath,
    languageId: args.languageId,
    sender: args.sender,
    commandOverride: args.commandOverride,
    operation: async (session) => {
      return sendRequest(session, "textDocument/hover", {
        textDocument: {
          uri: getDocumentUri({ rootPath: args.rootPath, filePath: args.filePath }),
        },
        position: {
          line: args.line,
          character: args.character,
        },
      });
    },
  });
}

export async function requestLspCompletion(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  filePath: string;
  line: number;
  character: number;
  commandOverride?: string;
}) {
  return withReadySession({
    rootPath: args.rootPath,
    languageId: args.languageId,
    sender: args.sender,
    commandOverride: args.commandOverride,
    operation: async (session) => {
      return sendRequest(session, "textDocument/completion", {
        textDocument: {
          uri: getDocumentUri({ rootPath: args.rootPath, filePath: args.filePath }),
        },
        position: {
          line: args.line,
          character: args.character,
        },
      });
    },
  });
}

export async function requestLspDefinition(args: {
  rootPath: string;
  languageId: SupportedLspLanguageId;
  sender: WebContents;
  filePath: string;
  line: number;
  character: number;
  commandOverride?: string;
}) {
  return withReadySession({
    rootPath: args.rootPath,
    languageId: args.languageId,
    sender: args.sender,
    commandOverride: args.commandOverride,
    operation: async (session) => {
      const response = await sendRequest<unknown>(session, "textDocument/definition", {
        textDocument: {
          uri: getDocumentUri({ rootPath: args.rootPath, filePath: args.filePath }),
        },
        position: {
          line: args.line,
          character: args.character,
        },
      });

      const locations = Array.isArray(response)
        ? response
        : response
          ? [response]
          : [];

      return locations
        .map((location) => {
          const item = location as {
            uri?: string;
            targetUri?: string;
            range?: { start: { line: number; character: number }; end: { line: number; character: number } };
            targetSelectionRange?: { start: { line: number; character: number }; end: { line: number; character: number } };
          };
          const uri = item.targetUri ?? item.uri;
          const range = item.targetSelectionRange ?? item.range;
          if (!uri || !range) {
            return null;
          }
          const filePath = toWorkspaceFilePathFromUri({ rootPath: args.rootPath, uri });
          if (!filePath) {
            return null;
          }
          return {
            filePath,
            range,
          };
        })
        .filter(Boolean);
    },
  });
}

export async function stopLspSessions(args: { rootPath?: string }) {
  for (const [key, session] of sessions) {
    if (args.rootPath && session.rootPath !== args.rootPath) {
      continue;
    }
    sessions.delete(key);
    try {
      sendNotification(session, "exit", {});
    } catch {
      // Ignore exit notification failures during teardown.
    }
    session.child.kill();
  }
  return { ok: true };
}

export async function disposeAllLspSessions() {
  await stopLspSessions({});
}
