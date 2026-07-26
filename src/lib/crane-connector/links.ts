export const STAVE_CRANE_CONNECTOR_GUIDE_URL =
  "https://github.com/sendbird/stave/blob/main/docs/features/crane-connector.md";

export function buildCraneConnectorSettingsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/apps/crane/settings/stave";
  url.search = "";
  url.hash = "";
  return url.toString();
}
