export const DEFAULT_STAVE_RELEASE_REPO = "sendbird-playground/stave";

export function resolveStaveReleaseRepo(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) {
    return DEFAULT_STAVE_RELEASE_REPO;
  }
  return candidate;
}
