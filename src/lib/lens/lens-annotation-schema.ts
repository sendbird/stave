import { z } from "zod";
import type {
  ElementPickerDebugSource,
  ElementPickerResult,
  LensAnnotation,
  LensAnnotationAnchor,
  LensAnnotationEventType,
  LensElementContextHint,
  LensNearbyElementHint,
  LensPageIdentity,
  LensRect,
  LensStyleEdit,
} from "./lens.types";
import {
  LENS_FEEDBACK_INTENTS,
  LENS_FEEDBACK_PRIORITIES,
} from "./lens.types";

export const LENS_UNTRUSTED_PAGE_EVIDENCE =
  "untrusted-page-evidence" as const;
export const LENS_REDACTED_VALUE = "[REDACTED]";

export const LENS_CAPTURE_LIMITS = {
  annotations: 50,
  annotationEventBytes: 256_000,
  annotationIdBytes: 160,
  documentIdBytes: 160,
  commentBytes: 2_048,
  selectorBytes: 2_048,
  tagNameBytes: 64,
  elementIdBytes: 256,
  classListItems: 32,
  classNameBytes: 256,
  computedStyleItems: 32,
  stylePropertyBytes: 96,
  styleValueBytes: 512,
  styleEditItems: 32,
  htmlBytes: 4_096,
  textBytes: 2_048,
  titleBytes: 512,
  urlBytes: 4_096,
  attributeItems: 16,
  attributeValueBytes: 512,
  ancestorItems: 6,
  nearbyItems: 8,
  contextTextBytes: 512,
  accessibleNameBytes: 512,
  roleBytes: 128,
  componentNameItems: 24,
  componentNameBytes: 256,
  sourceFileBytes: 2_048,
  sourceCoordinate: 10_000_000,
  createdAtBytes: 128,
  rectCoordinate: 10_000_000,
  rectSize: 1_000_000,
  viewportSize: 100_000,
  scrollCoordinate: 10_000_000,
  devicePixelRatio: 16,
  pin: 10_000,
} as const;

const SAFE_ATTRIBUTE_NAMES = new Set([
  "alt",
  "aria-describedby",
  "aria-label",
  "aria-labelledby",
  "data-cy",
  "data-test",
  "data-testid",
  "name",
  "placeholder",
  "role",
  "title",
  "type",
]);

const NEARBY_RELATIONS = [
  "parent",
  "previous",
  "next",
  "child",
  "within",
] as const;

const LensRectInputSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

const LensPageInputSchema = z
  .object({
    url: z.string(),
    title: z.string(),
    viewport: z
      .object({
        width: z.number(),
        height: z.number(),
        devicePixelRatio: z.number(),
      })
      .strict(),
    scroll: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .strict(),
    documentId: z.string(),
  })
  .strict();

const ElementIdentityInputSchema = z
  .object({
    tagName: z.string(),
    id: z.string().nullable().optional(),
    classList: z.array(z.string()),
  })
  .strict();

const ElementContextHintInputSchema = z
  .object({
    selector: z.string().nullable().optional(),
    tagName: z.string(),
    elementId: z.string().nullable().optional(),
    accessibleName: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
  })
  .strict();

const NearbyElementHintInputSchema = ElementContextHintInputSchema.extend({
  relation: z.enum(NEARBY_RELATIONS),
}).strict();

const DebugSourceInputSchema = z
  .object({
    fileName: z.string(),
    lineNumber: z.number(),
    columnNumber: z.number().optional(),
  })
  .strict();

const StyleEditInputSchema = z
  .object({
    property: z.string(),
    before: z.string(),
    after: z.string(),
  })
  .strict();

const AnnotationAnchorInputSchema = z
  .object({
    selector: z.string().nullable().optional(),
    bounds: LensRectInputSchema,
    element: ElementIdentityInputSchema.nullable().optional(),
    accessibleName: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    attributes: z.record(z.string(), z.string()),
    ancestors: z.array(ElementContextHintInputSchema),
    nearby: z.array(NearbyElementHintInputSchema),
    computedStyles: z.record(z.string(), z.string()),
    outerHTML: z.string().nullable().optional(),
    textContent: z.string().nullable().optional(),
    debugSource: DebugSourceInputSchema.nullable().optional(),
    componentNameChain: z.array(z.string()).nullable().optional(),
  })
  .strict();

const VisualReviewInputSchema = z
  .object({
    version: z.literal(1).optional(),
    page: LensPageInputSchema,
    anchor: AnnotationAnchorInputSchema,
    evidence: z
      .object({
        screenshot: z
          .object({
            kind: z.literal("clipped"),
            bounds: LensRectInputSchema,
          })
          .strict(),
        styleEdits: z.array(StyleEditInputSchema),
      })
      .strict(),
    feedback: z
      .object({
        comment: z.string(),
        intent: z.enum(LENS_FEEDBACK_INTENTS),
        priority: z.enum(LENS_FEEDBACK_PRIORITIES),
      })
      .strict(),
    trust: z.literal(LENS_UNTRUSTED_PAGE_EVIDENCE),
  })
  .strict();

const AnnotationInputSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["element", "area"]),
    pin: z.number(),
    rect: LensRectInputSchema,
    comment: z.string(),
    createdAt: z.string(),
    selector: z.string().nullable().optional(),
    tagName: z.string().nullable().optional(),
    elementId: z.string().nullable().optional(),
    classList: z.array(z.string()).nullable().optional(),
    computedStyles: z.record(z.string(), z.string()).nullable().optional(),
    outerHTML: z.string().nullable().optional(),
    textContent: z.string().nullable().optional(),
    debugSource: DebugSourceInputSchema.nullable().optional(),
    componentNameChain: z.array(z.string()).nullable().optional(),
    styleEdits: z.array(StyleEditInputSchema).nullable().optional(),
    intent: z.enum(LENS_FEEDBACK_INTENTS).optional(),
    priority: z.enum(LENS_FEEDBACK_PRIORITIES).optional(),
    review: VisualReviewInputSchema.optional(),
  })
  .strict();

const ElementPickerInputSchema = z
  .object({
    selector: z.string(),
    tagName: z.string(),
    id: z.string(),
    classList: z.array(z.string()),
    boundingBox: LensRectInputSchema,
    computedStyles: z.record(z.string(), z.string()),
    outerHTML: z.string(),
    textContent: z.string(),
    debugSource: DebugSourceInputSchema.nullable().optional(),
    componentNameChain: z.array(z.string()).nullable().optional(),
    page: LensPageInputSchema.optional(),
    anchor: AnnotationAnchorInputSchema.optional(),
    trust: z.literal(LENS_UNTRUSTED_PAGE_EVIDENCE).optional(),
  })
  .strict();

const AnnotationEventInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum(["add", "update", "remove"]),
      documentId: z.string(),
      annotation: z
        .unknown()
        .refine((value) => value !== undefined, "annotation is required"),
    })
    .strict(),
  z
    .object({
      type: z.literal("clear"),
      documentId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("submit"),
      documentId: z.string(),
      annotations: z
        .array(z.unknown())
        .max(LENS_CAPTURE_LIMITS.annotations),
    })
    .strict(),
]);

const AnnotationArrayInputSchema = z
  .array(z.unknown())
  .max(LENS_CAPTURE_LIMITS.annotations);

type AnnotationInput = z.infer<typeof AnnotationInputSchema>;
type AnnotationAnchorInput = z.infer<typeof AnnotationAnchorInputSchema>;
type ElementPickerInput = z.infer<typeof ElementPickerInputSchema>;
type LensPageInput = z.infer<typeof LensPageInputSchema>;

export interface LensAnnotationNormalizationContext {
  documentId: string;
  url: string;
  title: string;
  /**
   * Live guest payloads must include the main-issued document identity.
   * Omit only when upgrading the pre-envelope flat annotation shape.
   */
  requireDocumentIdentity?: boolean;
}

export interface NormalizedLensAnnotationEvent {
  type: LensAnnotationEventType;
  documentId: string;
  annotation?: LensAnnotation;
  annotations?: LensAnnotation[];
}

const UTF8_ENCODER = new TextEncoder();

function truncateUtf8(value: string, maxBytes: number): string {
  if (UTF8_ENCODER.encode(value).byteLength <= maxBytes) {
    return value;
  }

  let result = "";
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = UTF8_ENCODER.encode(character).byteLength;
    if (byteLength + characterBytes > maxBytes) {
      break;
    }
    result += character;
    byteLength += characterBytes;
  }
  return result;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function looksSecretLike(value: string): boolean {
  return (
    /\b(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|cookie|password|private[_-]?key|secret)\b\s*[:=]\s*\S+/i.test(
      value,
    ) ||
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(
      value,
    ) ||
    /\b(?:gh[pousr]_|sk-|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/i.test(value)
  );
}

export function redactLensSecretLikeText(value: string): string {
  return looksSecretLike(value) ? LENS_REDACTED_VALUE : value;
}

function normalizeString(
  value: string,
  maxBytes: number,
  options?: { compact?: boolean; redact?: boolean },
): string {
  const normalized = options?.compact === false ? value.trim() : compactText(value);
  const redacted =
    options?.redact === false
      ? normalized
      : redactLensSecretLikeText(normalized);
  return truncateUtf8(redacted, maxBytes);
}

function requireString(
  value: string,
  maxBytes: number,
  label: string,
  options?: { compact?: boolean; redact?: boolean },
): string {
  const normalized = normalizeString(value, maxBytes, options);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeRect(rect: z.infer<typeof LensRectInputSchema>): LensRect {
  return {
    x: Math.round(
      clamp(
        rect.x,
        -LENS_CAPTURE_LIMITS.rectCoordinate,
        LENS_CAPTURE_LIMITS.rectCoordinate,
      ),
    ),
    y: Math.round(
      clamp(
        rect.y,
        -LENS_CAPTURE_LIMITS.rectCoordinate,
        LENS_CAPTURE_LIMITS.rectCoordinate,
      ),
    ),
    width: Math.round(
      clamp(rect.width, 0, LENS_CAPTURE_LIMITS.rectSize),
    ),
    height: Math.round(
      clamp(rect.height, 0, LENS_CAPTURE_LIMITS.rectSize),
    ),
  };
}

export function sanitizeLensPageUrl(value: string): string {
  const bounded = requireString(
    value,
    LENS_CAPTURE_LIMITS.urlBytes,
    "Lens page URL",
    { compact: true, redact: false },
  );
  if (bounded === "about:blank") {
    return bounded;
  }

  let url: URL;
  try {
    url = new URL(bounded);
  } catch {
    throw new Error("Lens page URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Lens page URL protocol is not allowed: ${url.protocol}`);
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const sanitized = url.toString();
  if (UTF8_ENCODER.encode(sanitized).byteLength > LENS_CAPTURE_LIMITS.urlBytes) {
    throw new Error("Lens page URL exceeds the capture limit.");
  }
  return sanitized;
}

function normalizePageIdentity(
  page: LensPageInput | undefined,
  context: LensAnnotationNormalizationContext,
): LensPageIdentity {
  if (context.requireDocumentIdentity && !page) {
    throw new Error("Lens page document identity is required.");
  }

  const expectedDocumentId = requireString(
    context.documentId,
    LENS_CAPTURE_LIMITS.documentIdBytes,
    "Lens document identity",
    { redact: false },
  );
  if (page) {
    const payloadDocumentId = requireString(
      page.documentId,
      LENS_CAPTURE_LIMITS.documentIdBytes,
      "Lens document identity",
      { redact: false },
    );
    if (payloadDocumentId !== expectedDocumentId) {
      throw new Error("Rejected stale document identity.");
    }

    const payloadUrl = sanitizeLensPageUrl(page.url);
    const expectedUrl = sanitizeLensPageUrl(context.url);
    if (payloadUrl !== expectedUrl) {
      throw new Error("Rejected Lens page ownership mismatch.");
    }
  }

  return {
    url: sanitizeLensPageUrl(context.url),
    title: normalizeString(
      context.title || page?.title || "",
      LENS_CAPTURE_LIMITS.titleBytes,
      { compact: true },
    ),
    viewport: page
      ? {
          width: Math.round(
            clamp(page.viewport.width, 0, LENS_CAPTURE_LIMITS.viewportSize),
          ),
          height: Math.round(
            clamp(page.viewport.height, 0, LENS_CAPTURE_LIMITS.viewportSize),
          ),
          devicePixelRatio: clamp(
            page.viewport.devicePixelRatio,
            0.1,
            LENS_CAPTURE_LIMITS.devicePixelRatio,
          ),
        }
      : { width: 0, height: 0, devicePixelRatio: 1 },
    scroll: page
      ? {
          x: Math.round(
            clamp(
              page.scroll.x,
              -LENS_CAPTURE_LIMITS.scrollCoordinate,
              LENS_CAPTURE_LIMITS.scrollCoordinate,
            ),
          ),
          y: Math.round(
            clamp(
              page.scroll.y,
              -LENS_CAPTURE_LIMITS.scrollCoordinate,
              LENS_CAPTURE_LIMITS.scrollCoordinate,
            ),
          ),
        }
      : { x: 0, y: 0 },
    documentId: expectedDocumentId,
  };
}

function normalizeTagName(value: string): string {
  const tagName = requireString(
    value.toLowerCase(),
    LENS_CAPTURE_LIMITS.tagNameBytes,
    "Lens element tag name",
    { redact: false },
  );
  if (!/^[a-z][a-z0-9-]*$/.test(tagName)) {
    throw new Error("Lens element tag name is invalid.");
  }
  return tagName;
}

function normalizeClassList(values: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (normalized.length >= LENS_CAPTURE_LIMITS.classListItems) {
      break;
    }
    const className = normalizeString(
      value,
      LENS_CAPTURE_LIMITS.classNameBytes,
      { compact: true },
    );
    if (!className || seen.has(className)) {
      continue;
    }
    seen.add(className);
    normalized.push(className);
  }
  return normalized;
}

function normalizeStringRecord(
  input: Record<string, string>,
  options: {
    entries: number;
    keyBytes: number;
    valueBytes: number;
    allowedKeys?: ReadonlySet<string>;
  },
): Record<string, string> {
  const entries: Array<[string, string]> = [];
  for (const [rawKey, rawValue] of Object.entries(input)) {
    if (entries.length >= options.entries) {
      break;
    }
    const key = normalizeString(rawKey.toLowerCase(), options.keyBytes, {
      compact: true,
      redact: false,
    });
    if (!key || (options.allowedKeys && !options.allowedKeys.has(key))) {
      continue;
    }
    entries.push([
      key,
      normalizeString(rawValue, options.valueBytes, {
        compact: true,
      }),
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeDebugSource(
  source: z.infer<typeof DebugSourceInputSchema> | null | undefined,
): ElementPickerDebugSource | undefined {
  if (!source) {
    return undefined;
  }
  return {
    fileName: requireString(
      source.fileName,
      LENS_CAPTURE_LIMITS.sourceFileBytes,
      "Lens source file",
      { compact: true },
    ),
    lineNumber: Math.round(
      clamp(source.lineNumber, 1, LENS_CAPTURE_LIMITS.sourceCoordinate),
    ),
    ...(typeof source.columnNumber === "number"
      ? {
          columnNumber: Math.round(
            clamp(
              source.columnNumber,
              1,
              LENS_CAPTURE_LIMITS.sourceCoordinate,
            ),
          ),
        }
      : {}),
  };
}

function normalizeContextHint(
  hint: z.infer<typeof ElementContextHintInputSchema>,
): LensElementContextHint {
  return {
    tagName: normalizeTagName(hint.tagName),
    ...(hint.selector
      ? {
          selector: normalizeString(
            hint.selector,
            LENS_CAPTURE_LIMITS.selectorBytes,
          ),
        }
      : {}),
    ...(hint.elementId
      ? {
          elementId: normalizeString(
            hint.elementId,
            LENS_CAPTURE_LIMITS.elementIdBytes,
          ),
        }
      : {}),
    ...(hint.accessibleName
      ? {
          accessibleName: normalizeString(
            hint.accessibleName,
            LENS_CAPTURE_LIMITS.accessibleNameBytes,
          ),
        }
      : {}),
    ...(hint.role
      ? {
          role: normalizeString(hint.role, LENS_CAPTURE_LIMITS.roleBytes),
        }
      : {}),
    ...(hint.text
      ? {
          text: normalizeString(
            hint.text,
            LENS_CAPTURE_LIMITS.contextTextBytes,
          ),
        }
      : {}),
  };
}

function normalizeNearbyHint(
  hint: z.infer<typeof NearbyElementHintInputSchema>,
): LensNearbyElementHint {
  return {
    relation: hint.relation,
    ...normalizeContextHint(hint),
  };
}

function normalizeStyleEdits(
  edits: readonly z.infer<typeof StyleEditInputSchema>[],
): LensStyleEdit[] {
  return edits
    .slice(0, LENS_CAPTURE_LIMITS.styleEditItems)
    .map((edit) => ({
      property: requireString(
        edit.property,
        LENS_CAPTURE_LIMITS.stylePropertyBytes,
        "Lens style property",
        { redact: false },
      ),
      before: normalizeString(
        edit.before,
        LENS_CAPTURE_LIMITS.styleValueBytes,
      ),
      after: normalizeString(
        edit.after,
        LENS_CAPTURE_LIMITS.styleValueBytes,
      ),
    }));
}

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function buildSafeOuterHtml(args: {
  tagName?: string;
  elementId?: string;
  textContent?: string;
}): string | undefined {
  if (!args.tagName) {
    return undefined;
  }
  const id = args.elementId
    ? ` id="${escapeHtmlAttribute(args.elementId)}"`
    : "";
  const text = args.textContent ? escapeHtmlText(args.textContent) : "";
  return truncateUtf8(
    `<${args.tagName}${id}>${text}</${args.tagName}>`,
    LENS_CAPTURE_LIMITS.htmlBytes,
  );
}

function normalizeAnchor(
  input: AnnotationAnchorInput | undefined,
  legacy: {
    rect: z.infer<typeof LensRectInputSchema>;
    selector?: string | null;
    tagName?: string | null;
    elementId?: string | null;
    classList?: string[] | null;
    computedStyles?: Record<string, string> | null;
    outerHTML?: string | null;
    textContent?: string | null;
    debugSource?: z.infer<typeof DebugSourceInputSchema> | null;
    componentNameChain?: string[] | null;
  },
): LensAnnotationAnchor {
  const selector = input?.selector ?? legacy.selector;
  const rawElement = input?.element;
  const tagName = rawElement?.tagName ?? legacy.tagName;
  const elementId = rawElement?.id ?? legacy.elementId;
  const classList = normalizeClassList(
    rawElement?.classList ?? legacy.classList ?? [],
  );
  const textContentSource = input?.textContent ?? legacy.textContent;
  const textContent = textContentSource
    ? normalizeString(textContentSource, LENS_CAPTURE_LIMITS.textBytes, {
        compact: true,
      })
    : undefined;
  const normalizedTagName = tagName ? normalizeTagName(tagName) : undefined;
  const normalizedElementId = elementId
    ? normalizeString(elementId, LENS_CAPTURE_LIMITS.elementIdBytes)
    : undefined;
  const outerHTML = buildSafeOuterHtml({
    tagName: normalizedTagName,
    elementId: normalizedElementId,
    textContent,
  });
  const debugSource = normalizeDebugSource(
    input?.debugSource ?? legacy.debugSource,
  );

  return {
    bounds: normalizeRect(input?.bounds ?? legacy.rect),
    ...(selector
      ? {
          selector: normalizeString(
            selector,
            LENS_CAPTURE_LIMITS.selectorBytes,
          ),
        }
      : {}),
    ...(normalizedTagName
      ? {
          element: {
            tagName: normalizedTagName,
            ...(normalizedElementId ? { id: normalizedElementId } : {}),
            classList,
          },
        }
      : {}),
    ...(input?.accessibleName
      ? {
          accessibleName: normalizeString(
            input.accessibleName,
            LENS_CAPTURE_LIMITS.accessibleNameBytes,
          ),
        }
      : {}),
    ...(input?.role
      ? {
          role: normalizeString(input.role, LENS_CAPTURE_LIMITS.roleBytes),
        }
      : {}),
    attributes: normalizeStringRecord(input?.attributes ?? {}, {
      entries: LENS_CAPTURE_LIMITS.attributeItems,
      keyBytes: LENS_CAPTURE_LIMITS.stylePropertyBytes,
      valueBytes: LENS_CAPTURE_LIMITS.attributeValueBytes,
      allowedKeys: SAFE_ATTRIBUTE_NAMES,
    }),
    ancestors: (input?.ancestors ?? [])
      .slice(0, LENS_CAPTURE_LIMITS.ancestorItems)
      .map(normalizeContextHint),
    nearby: (input?.nearby ?? [])
      .slice(0, LENS_CAPTURE_LIMITS.nearbyItems)
      .map(normalizeNearbyHint),
    computedStyles: normalizeStringRecord(
      input?.computedStyles ?? legacy.computedStyles ?? {},
      {
        entries: LENS_CAPTURE_LIMITS.computedStyleItems,
        keyBytes: LENS_CAPTURE_LIMITS.stylePropertyBytes,
        valueBytes: LENS_CAPTURE_LIMITS.styleValueBytes,
      },
    ),
    ...(outerHTML ? { outerHTML } : {}),
    ...(textContent ? { textContent } : {}),
    ...(debugSource ? { debugSource } : {}),
    ...((input?.componentNameChain ?? legacy.componentNameChain)?.length
      ? {
          componentNameChain: normalizeClassList(
            input?.componentNameChain ?? legacy.componentNameChain ?? [],
          )
            .slice(0, LENS_CAPTURE_LIMITS.componentNameItems)
            .map((name) =>
              normalizeString(name, LENS_CAPTURE_LIMITS.componentNameBytes),
            ),
        }
      : {}),
  };
}

function parseAnnotation(input: unknown): AnnotationInput {
  const parsed = AnnotationInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new Error(
      `Invalid Lens annotation: ${path}${issue?.message ?? "unknown error"}`,
    );
  }
  return parsed.data;
}

export function normalizeLensAnnotationPayload(
  input: unknown,
  context: LensAnnotationNormalizationContext,
): LensAnnotation {
  const raw = parseAnnotation(input);
  const page = normalizePageIdentity(raw.review?.page, context);
  const anchor = normalizeAnchor(raw.review?.anchor, raw);
  const comment = requireString(
    raw.review?.feedback.comment ?? raw.comment,
    LENS_CAPTURE_LIMITS.commentBytes,
    "Lens annotation comment",
    { compact: false },
  );
  const intent =
    raw.review?.feedback.intent ?? raw.intent ?? ("fix" as const);
  const priority =
    raw.review?.feedback.priority ?? raw.priority ?? ("medium" as const);
  const styleEdits = normalizeStyleEdits(
    raw.review?.evidence.styleEdits ?? raw.styleEdits ?? [],
  );
  const screenshotBounds = raw.review?.evidence.screenshot.bounds
    ? normalizeRect(raw.review.evidence.screenshot.bounds)
    : anchor.bounds;
  const createdAt = requireString(
    raw.createdAt,
    LENS_CAPTURE_LIMITS.createdAtBytes,
    "Lens annotation timestamp",
    { redact: false },
  );
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    throw new Error("Invalid Lens annotation: createdAt must be an ISO date.");
  }

  const review = {
    version: 1 as const,
    page,
    anchor,
    evidence: {
      screenshot: {
        kind: "clipped" as const,
        bounds: screenshotBounds,
      },
      styleEdits,
    },
    feedback: {
      comment,
      intent,
      priority,
    },
    trust: LENS_UNTRUSTED_PAGE_EVIDENCE,
  };

  return {
    id: requireString(
      raw.id,
      LENS_CAPTURE_LIMITS.annotationIdBytes,
      "Lens annotation id",
      { redact: false },
    ),
    kind: raw.kind,
    pin: Math.round(clamp(raw.pin, 1, LENS_CAPTURE_LIMITS.pin)),
    rect: anchor.bounds,
    comment,
    createdAt: new Date(createdAtMs).toISOString(),
    ...(anchor.selector ? { selector: anchor.selector } : {}),
    ...(anchor.element
      ? {
          tagName: anchor.element.tagName,
          elementId: anchor.element.id ?? "",
          classList: anchor.element.classList,
          computedStyles: anchor.computedStyles,
        }
      : {}),
    ...(anchor.outerHTML ? { outerHTML: anchor.outerHTML } : {}),
    ...(anchor.textContent ? { textContent: anchor.textContent } : {}),
    ...(anchor.debugSource ? { debugSource: anchor.debugSource } : {}),
    ...(anchor.componentNameChain
      ? { componentNameChain: anchor.componentNameChain }
      : {}),
    styleEdits,
    review,
  };
}

export function normalizeLensAnnotationArray(
  input: unknown,
  context: LensAnnotationNormalizationContext,
): LensAnnotation[] {
  const parsed = AnnotationArrayInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid Lens annotation collection: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }
  return parsed.data.map((annotation) =>
    normalizeLensAnnotationPayload(annotation, context),
  );
}

/** Restore saved evidence using its recorded identity, never the current page's identity. */
export const PersistedLensAnnotationSchema = AnnotationInputSchema.transform((raw, context) => {
  try {
    return normalizeLensAnnotationPayload(raw, {
      documentId: raw.review?.page.documentId ?? "legacy-persisted-annotation",
      url: raw.review?.page.url ?? "about:blank",
      title: raw.review?.page.title ?? "",
    });
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid saved annotation" });
    return z.NEVER;
  }
});

export function normalizeLensAnnotationEventPayload(
  input: unknown,
  context: LensAnnotationNormalizationContext,
): NormalizedLensAnnotationEvent {
  const parsed = AnnotationEventInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid Lens annotation event: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }
  if (parsed.data.documentId !== context.documentId) {
    throw new Error("Rejected stale document identity.");
  }

  if (
    parsed.data.type === "add" ||
    parsed.data.type === "update" ||
    parsed.data.type === "remove"
  ) {
    return {
      type: parsed.data.type,
      documentId: parsed.data.documentId,
      annotation: normalizeLensAnnotationPayload(parsed.data.annotation, {
        ...context,
        requireDocumentIdentity: true,
      }),
    };
  }

  if (parsed.data.type === "submit") {
    return {
      type: parsed.data.type,
      documentId: parsed.data.documentId,
      annotations: normalizeLensAnnotationArray(parsed.data.annotations, {
        ...context,
        requireDocumentIdentity: true,
      }),
    };
  }

  return {
    type: "clear",
    documentId: parsed.data.documentId,
  };
}

function parseElementPicker(input: unknown): ElementPickerInput {
  const parsed = ElementPickerInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid Lens element selection: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
    );
  }
  return parsed.data;
}

export function normalizeLensElementPickerResult(
  input: unknown,
  context: LensAnnotationNormalizationContext,
): ElementPickerResult {
  const raw = parseElementPicker(input);
  const page = normalizePageIdentity(raw.page, context);
  const anchor = normalizeAnchor(raw.anchor, {
    rect: raw.boundingBox,
    selector: raw.selector,
    tagName: raw.tagName,
    elementId: raw.id,
    classList: raw.classList,
    computedStyles: raw.computedStyles,
    outerHTML: raw.outerHTML,
    textContent: raw.textContent,
    debugSource: raw.debugSource,
    componentNameChain: raw.componentNameChain,
  });

  return {
    selector: anchor.selector ?? "",
    tagName: anchor.element?.tagName ?? normalizeTagName(raw.tagName),
    id: anchor.element?.id ?? "",
    classList: anchor.element?.classList ?? [],
    boundingBox: anchor.bounds,
    computedStyles: anchor.computedStyles,
    outerHTML: anchor.outerHTML ?? "",
    textContent: anchor.textContent ?? "",
    ...(anchor.debugSource ? { debugSource: anchor.debugSource } : {}),
    ...(anchor.componentNameChain
      ? { componentNameChain: anchor.componentNameChain }
      : {}),
    page,
    anchor,
    trust: LENS_UNTRUSTED_PAGE_EVIDENCE,
  };
}
