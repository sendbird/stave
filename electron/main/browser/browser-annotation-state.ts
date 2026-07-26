import type {
  LensAnnotation,
  LensAnnotationEventType,
} from "../../../src/lib/lens/lens.types";

export interface LensAnnotationDocumentState {
  documentId: string;
  annotationNonce: string | null;
  annotations: LensAnnotation[];
}

export interface LensAnnotationStateEvent {
  type: LensAnnotationEventType;
  documentId?: string;
  annotation?: LensAnnotation;
  annotations?: LensAnnotation[];
}

export function invalidateLensAnnotationDocument(
  state: LensAnnotationDocumentState,
  next: {
    documentId: string;
    annotationNonce: string;
  },
): boolean {
  if (state.documentId === next.documentId) {
    return false;
  }

  state.documentId = next.documentId;
  state.annotationNonce = next.annotationNonce;
  state.annotations = [];
  return true;
}

export function applyLensAnnotationEvent(
  state: LensAnnotationDocumentState,
  event: LensAnnotationStateEvent,
): boolean {
  if (!event.documentId || event.documentId !== state.documentId) {
    return false;
  }

  if (
    (event.type === "add" || event.type === "update") &&
    event.annotation?.review.page.documentId === state.documentId
  ) {
    state.annotations = [
      ...state.annotations.filter(
        (annotation) => annotation.id !== event.annotation?.id,
      ),
      event.annotation,
    ].sort((left, right) => left.pin - right.pin);
    return true;
  }

  if (
    event.type === "remove" &&
    event.annotation?.review.page.documentId === state.documentId
  ) {
    state.annotations = state.annotations.filter(
      (annotation) => annotation.id !== event.annotation?.id,
    );
    return true;
  }

  if (
    event.type === "submit" &&
    event.annotations?.every(
      (annotation) => annotation.review.page.documentId === state.documentId,
    )
  ) {
    state.annotations = [...event.annotations].sort(
      (left, right) => left.pin - right.pin,
    );
    return true;
  }

  if (event.type === "clear") {
    state.annotations = [];
    return true;
  }

  return false;
}
