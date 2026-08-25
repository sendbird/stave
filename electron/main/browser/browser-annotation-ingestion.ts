import {
  LENS_CAPTURE_LIMITS,
  normalizeLensAnnotationArray,
  normalizeLensAnnotationEventPayload,
  normalizeLensAnnotationPayload,
  normalizeLensElementPickerResult,
  type LensAnnotationNormalizationContext,
  type NormalizedLensAnnotationEvent,
} from "../../../src/lib/lens/lens-annotation-schema";
import type {
  ElementPickerResult,
  LensAnnotation,
} from "../../../src/lib/lens/lens.types";
import type { BrowserSessionState } from "./browser-manager";
import { executeInLensAnnotationWorld } from "./browser-annotation-world";

export const LENS_ANNOTATION_BEACON_MARKER = "__STAVE_ANN__";

export interface LensAnnotationConsoleMessageResult {
  recognized: boolean;
  event?: NormalizedLensAnnotationEvent;
}

export function lensAnnotationNormalizationContext(
  session: BrowserSessionState,
): LensAnnotationNormalizationContext {
  return {
    documentId: session.documentId,
    url:
      session.webContents.getURL() ||
      session.navigationState.url ||
      "about:blank",
    title:
      session.webContents.getTitle() || session.navigationState.title || "",
  };
}

export function assertLensDocumentIdentity(
  session: BrowserSessionState,
  documentId: string | undefined,
): void {
  if (documentId && documentId !== session.documentId) {
    throw new Error("Lens page changed before the operation completed.");
  }
}

export function normalizeAnnotationEventForSession(
  session: BrowserSessionState,
  input: unknown,
): NormalizedLensAnnotationEvent {
  return normalizeLensAnnotationEventPayload(
    input,
    lensAnnotationNormalizationContext(session),
  );
}

export function readLensAnnotationConsoleMessage(
  session: BrowserSessionState,
  message: string,
): LensAnnotationConsoleMessageResult {
  if (!message.startsWith(LENS_ANNOTATION_BEACON_MARKER)) {
    return { recognized: false };
  }

  const expectedPrefix = session.annotationNonce
    ? `${LENS_ANNOTATION_BEACON_MARKER}${session.annotationNonce}`
    : null;
  if (!expectedPrefix || !message.startsWith(expectedPrefix)) {
    return { recognized: true };
  }

  const serializedPayload = message.slice(expectedPrefix.length);
  if (
    Buffer.byteLength(serializedPayload, "utf8") >
    LENS_CAPTURE_LIMITS.annotationEventBytes
  ) {
    throw new Error("Lens annotation event exceeds the capture limit.");
  }

  return {
    recognized: true,
    event: normalizeAnnotationEventForSession(
      session,
      JSON.parse(serializedPayload),
    ),
  };
}

export function normalizeElementPickerResultForSession(
  session: BrowserSessionState,
  input: unknown,
): ElementPickerResult {
  return normalizeLensElementPickerResult(input, {
    ...lensAnnotationNormalizationContext(session),
    requireDocumentIdentity: true,
  });
}

export function normalizeStoredAnnotationsForSession(
  session: BrowserSessionState,
  annotations: readonly unknown[],
): LensAnnotation[] {
  const context = lensAnnotationNormalizationContext(session);
  return annotations.flatMap((annotation) => {
    try {
      return [
        normalizeLensAnnotationPayload(annotation, {
          ...context,
          requireDocumentIdentity: false,
        }),
      ];
    } catch {
      return [];
    }
  });
}

export async function readNormalizedPageAnnotations(
  session: BrowserSessionState,
): Promise<LensAnnotation[]> {
  const annotations = await executeInLensAnnotationWorld<unknown>(
    session.webContents,
    "window.__staveGetAnnotations?.() ?? []",
  );
  return normalizeLensAnnotationArray(annotations, {
    ...lensAnnotationNormalizationContext(session),
    requireDocumentIdentity: true,
  });
}
