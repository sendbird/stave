/**
 * Annotation controls run outside the page's main JavaScript world so page
 * scripts cannot read the event nonce or replace Lens annotation functions.
 * The DOM remains shared, which is required for selection and highlighting.
 */
export const LENS_ANNOTATION_WORLD_ID = 99_731;

export function executeInLensAnnotationWorld<T = unknown>(
  webContents: Pick<
    Electron.WebContents,
    "executeJavaScriptInIsolatedWorld"
  >,
  code: string,
): Promise<T> {
  return webContents.executeJavaScriptInIsolatedWorld(
    LENS_ANNOTATION_WORLD_ID,
    [{ code }],
  ) as Promise<T>;
}
