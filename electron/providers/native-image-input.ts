import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CanonicalConversationRequest,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import {
  buildProviderTurnPrompt,
  filterPromptRetrievedContext,
} from "../../src/lib/providers/provider-request-translators";
import { STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS } from "../../src/lib/task-context/current-task-awareness";
import { dedupeRetrievedContextForSession } from "./retrieved-context-dedup";

const CODEX_IMAGE_DETAIL = "original" as const;
const ACP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ACP_IMAGES_TOTAL_MAX_BYTES = 10 * 1024 * 1024;

/** Image MIME types accepted by both native provider adapters. */
export type NativeImageMimeType =
  "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Provider-neutral image input resolved from canonical conversation context. */
export type NativeImageInput =
  | {
      source: "local-file";
      path: string;
      label: string;
      mimeType: NativeImageMimeType;
    }
  | {
      source: "data-url";
      dataUrl: string;
      base64Data: string;
      label: string;
      mimeType: NativeImageMimeType;
    };

/** Codex App Server image items appended to a `turn/start` input array. */
export type CodexNativeImageItem =
  | {
      type: "localImage";
      path: string;
      detail: typeof CODEX_IMAGE_DETAIL;
    }
  | {
      type: "image";
      url: string;
      detail: typeof CODEX_IMAGE_DETAIL;
    };

/** Claude SDK image block used in a structured user message. */
export interface ClaudeNativeImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: NativeImageMimeType;
    data: string;
  };
}

/** ACP image block used when the agent advertises prompt image support. */
export interface AcpNativeImageBlock {
  type: "image";
  mimeType: NativeImageMimeType;
  data: string;
}

/** Keeps text-only Claude turns compact while adding structured image blocks when present. */
export function buildClaudeNativeUserContent(args: {
  text: string;
  blocks?: ClaudeNativeImageBlock[];
}) {
  const blocks = args.blocks ?? [];
  return blocks.length > 0
    ? [{ type: "text" as const, text: args.text }, ...blocks]
    : args.text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNativeImageMimeType(value: string): NativeImageMimeType | null {
  switch (value.trim().toLowerCase()) {
    case "image/jpeg":
    case "image/png":
    case "image/gif":
    case "image/webp":
      return value.trim().toLowerCase() as NativeImageMimeType;
    default:
      return null;
  }
}

function imageMimeTypeFromPath(filePath: string): NativeImageMimeType | null {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

function parseSupportedImageDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/is.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  const mimeType = toNativeImageMimeType(match[1] ?? "");
  const base64Data = match[2]?.replaceAll(/\s/g, "");
  return mimeType && base64Data
    ? { dataUrl: dataUrl.trim(), mimeType, base64Data }
    : null;
}

/** Collects supported current-turn images without flattening their bytes into text. */
export function collectNativeImageInputs(args: {
  cwd: string;
  conversation?: CanonicalConversationRequest;
}) {
  const inputs: NativeImageInput[] = [];
  const seen = new Set<string>();
  let inlineImageCount = 0;
  let unresolvedInlineImageCount = 0;

  for (const part of args.conversation?.contextParts ?? []) {
    if (part.type === "image_context") {
      inlineImageCount += 1;
      const parsed = parseSupportedImageDataUrl(part.dataUrl);
      if (!parsed) {
        unresolvedInlineImageCount += 1;
        continue;
      }
      const key = `data-url:${parsed.dataUrl}`;
      if (!seen.has(key)) {
        seen.add(key);
        inputs.push({
          source: "data-url",
          dataUrl: parsed.dataUrl,
          base64Data: parsed.base64Data,
          label: part.label,
          mimeType: parsed.mimeType,
        });
      }
      continue;
    }

    if (part.type !== "file_context" || part.language !== "image") {
      continue;
    }
    const mimeType = imageMimeTypeFromPath(part.filePath);
    if (!mimeType) {
      continue;
    }
    const absolutePath = path.resolve(args.cwd, part.filePath);
    const key = `local-file:${absolutePath}`;
    if (!seen.has(key)) {
      seen.add(key);
      inputs.push({
        source: "local-file",
        path: absolutePath,
        label: part.filePath,
        mimeType,
      });
    }
  }

  return { inputs, inlineImageCount, unresolvedInlineImageCount };
}

/** Removes data URLs that will be sent as native blocks while retaining unsupported fallbacks. */
export function withoutNativeInlineImageData(args: {
  conversation?: CanonicalConversationRequest;
  inputs: NativeImageInput[];
}) {
  if (!args.conversation) {
    return undefined;
  }
  const nativeDataUrls = new Set(
    args.inputs.flatMap((input) =>
      input.source === "data-url" ? [input.dataUrl] : [],
    ),
  );
  if (nativeDataUrls.size === 0) {
    return args.conversation;
  }
  return {
    ...args.conversation,
    contextParts: args.conversation.contextParts.map((part) =>
      part.type === "image_context" && nativeDataUrls.has(part.dataUrl.trim())
        ? { ...part, dataUrl: "" }
        : part,
    ),
  };
}

/** Converts common native images into Codex App Server turn input items. */
export function buildCodexNativeImageItems(
  inputs: NativeImageInput[],
): CodexNativeImageItem[] {
  return inputs.map((input) =>
    input.source === "local-file"
      ? {
          type: "localImage",
          path: input.path,
          detail: CODEX_IMAGE_DETAIL,
        }
      : {
          type: "image",
          url: input.dataUrl,
          detail: CODEX_IMAGE_DETAIL,
        },
  );
}

async function resolveBase64NativeImages(args: {
  inputs: NativeImageInput[];
  readLocalFile?: (filePath: string) => Promise<Uint8Array>;
  statLocalFile?: (filePath: string) => Promise<{ size: number }>;
  maxImageBytes?: number;
  maxTotalBytes?: number;
}) {
  const images: Array<{ mimeType: NativeImageMimeType; data: string }> = [];
  const acceptedInputs: NativeImageInput[] = [];
  let failedLocalImageCount = 0;
  let skippedOversizedImageCount = 0;
  let totalBytes = 0;
  const readLocalFile = args.readLocalFile ?? readFile;
  const statLocalFile =
    args.statLocalFile ??
    (args.readLocalFile
      ? undefined
      : async (filePath: string) => {
          const result = await stat(filePath);
          return { size: result.size };
        });
  const canAccept = (size: number) =>
    (args.maxImageBytes === undefined || size <= args.maxImageBytes) &&
    (args.maxTotalBytes === undefined ||
      totalBytes + size <= args.maxTotalBytes);

  for (const input of args.inputs) {
    if (input.source === "data-url") {
      const size = Buffer.byteLength(input.base64Data, "base64");
      if (!canAccept(size)) {
        skippedOversizedImageCount += 1;
        continue;
      }
      totalBytes += size;
      acceptedInputs.push(input);
      images.push({
        mimeType: input.mimeType,
        data: input.base64Data,
      });
      continue;
    }
    try {
      if (statLocalFile) {
        const file = await statLocalFile(input.path);
        if (!canAccept(file.size)) {
          skippedOversizedImageCount += 1;
          continue;
        }
      }
      const bytes = await readLocalFile(input.path);
      if (!canAccept(bytes.byteLength)) {
        skippedOversizedImageCount += 1;
        continue;
      }
      totalBytes += bytes.byteLength;
      acceptedInputs.push(input);
      images.push({
        mimeType: input.mimeType,
        data: Buffer.from(bytes).toString("base64"),
      });
    } catch {
      failedLocalImageCount += 1;
    }
  }

  return {
    images,
    acceptedInputs,
    failedLocalImageCount,
    skippedOversizedImageCount,
  };
}

/** Resolves native images into Claude message blocks only at the SDK boundary. */
export async function buildClaudeNativeImageBlocks(args: {
  inputs: NativeImageInput[];
  readLocalFile?: (filePath: string) => Promise<Uint8Array>;
}) {
  const resolved = await resolveBase64NativeImages(args);
  return {
    blocks: resolved.images.map<ClaudeNativeImageBlock>((image) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mimeType,
        data: image.data,
      },
    })),
    failedLocalImageCount: resolved.failedLocalImageCount,
  };
}

/** Resolves native images into ACP v1 prompt blocks at the provider boundary. */
export async function buildAcpNativeImageBlocks(args: {
  inputs: NativeImageInput[];
  readLocalFile?: (filePath: string) => Promise<Uint8Array>;
  statLocalFile?: (filePath: string) => Promise<{ size: number }>;
}) {
  const resolved = await resolveBase64NativeImages({
    ...args,
    maxImageBytes: ACP_IMAGE_MAX_BYTES,
    maxTotalBytes: ACP_IMAGES_TOTAL_MAX_BYTES,
  });
  return {
    blocks: resolved.images.map<AcpNativeImageBlock>((image) => ({
      type: "image",
      mimeType: image.mimeType,
      data: image.data,
    })),
    failedLocalImageCount: resolved.failedLocalImageCount,
    skippedOversizedImageCount: resolved.skippedOversizedImageCount,
    acceptedInputs: resolved.acceptedInputs,
  };
}

/** Checks image modality support for a selected raw Codex model catalog entry. */
export function codexModelCatalogSupportsImages(args: {
  model?: string;
  models: unknown[];
}) {
  const selectedModel = args.model?.trim();
  const candidate =
    args.models.find((model) => {
      if (!isRecord(model)) return false;
      if (!selectedModel) return model.isDefault === true;
      return model.id === selectedModel || model.model === selectedModel;
    }) ?? (!selectedModel ? args.models[0] : undefined);

  if (!isRecord(candidate)) {
    return false;
  }
  if (!("inputModalities" in candidate)) {
    return true;
  }
  return (
    Array.isArray(candidate.inputModalities) &&
    candidate.inputModalities.includes("image")
  );
}

/** Queries the current App Server catalog before using model-specific image input. */
export async function queryCodexModelImageSupport(args: {
  model?: string;
  request: (method: string, params: unknown) => Promise<unknown>;
}) {
  const response = await args.request("model/list", {
    includeHidden: true,
    limit: 100,
  });
  const models =
    isRecord(response) && Array.isArray(response.data) ? response.data : [];
  return codexModelCatalogSupportsImages({
    model: args.model,
    models,
  });
}

/** Prepares a Codex turn's native images with a text fallback on catalog errors. */
export async function prepareCodexNativeImageInput(args: {
  cwd: string;
  conversation?: CanonicalConversationRequest;
  model?: string;
  request: (method: string, params: unknown) => Promise<unknown>;
}) {
  const collection = collectNativeImageInputs(args);
  let supportsNativeImages = false;
  if (collection.inputs.length > 0) {
    try {
      supportsNativeImages = await queryCodexModelImageSupport(args);
    } catch (error) {
      console.warn("[provider-runtime] Codex image capability check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    nativeImageItems: supportsNativeImages
      ? buildCodexNativeImageItems(collection.inputs)
      : [],
    includeImageData:
      !supportsNativeImages || collection.unresolvedInlineImageCount > 0,
  };
}

/** Builds the prompt and native image items for one Codex App Server turn. */
export async function prepareCodexImageAwareTurnInput(args: {
  cwd: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: CanonicalConversationRequest;
  activeResumeSessionId?: string | null;
  taskId?: string | null;
  hasEmbeddedStaveLocalMcp: boolean;
  model?: string;
  request: (method: string, params: unknown) => Promise<unknown>;
}) {
  const filteredConversation = args.conversation
    ? filterPromptRetrievedContext({
        conversation: args.conversation,
        excludedSourceIds: args.hasEmbeddedStaveLocalMcp
          ? []
          : [...STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS],
      })
    : undefined;
  // Collapse live-state blocks that came out identical to what this thread was
  // already given. `commitRetrievedContextDedup` must run only once the turn
  // was accepted by the app server, otherwise a failed dispatch would make the
  // next turn believe the content had been delivered.
  const retrievedContextDedup = dedupeRetrievedContextForSession({
    conversation: filteredConversation,
    activeResumeSessionId: args.activeResumeSessionId,
    taskId: args.taskId,
  });
  const conversation = retrievedContextDedup.conversation;
  const imageInput = await prepareCodexNativeImageInput({
    cwd: args.cwd,
    conversation,
    model: args.model ?? conversation?.target.model,
    request: args.request,
  });
  return {
    prompt: buildProviderTurnPrompt({
      providerId: args.providerId,
      prompt: args.prompt,
      conversation,
      activeResumeSessionId: args.activeResumeSessionId,
      includeImageData: imageInput.includeImageData,
    }),
    nativeImageItems: imageInput.nativeImageItems,
    commitRetrievedContextDedup: retrievedContextDedup.commit,
  };
}
