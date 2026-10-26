/**
 * The address as the toolbar shows it while nobody is editing it: without the
 * `http://` or `https://` prefix, so a narrow address bar spends its width on
 * the host and path. Editing always shows and submits the full address.
 *
 * Other schemes (`file:`, `about:`, `data:`) stay, because without them the
 * address would no longer say what kind of page it is.
 */
export function formatLensAddressForDisplay(address: string): string {
  const match = /^https?:\/\//i.exec(address);
  if (!match) {
    return address;
  }
  const rest = address.slice(match[0].length);
  return rest.length > 0 ? rest : address;
}
