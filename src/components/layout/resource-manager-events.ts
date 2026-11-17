export const OPEN_RESOURCE_MANAGER_EVENT = "stave:open-resource-manager";

export function openResourceManager() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_RESOURCE_MANAGER_EVENT));
}
