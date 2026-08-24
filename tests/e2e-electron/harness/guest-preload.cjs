// Stand-in for the Lens guest preload. Its only job here is to prove that the
// path main forces is the path the guest actually loads: the clamp overwriting
// `preload` is a security property, so the harness asserts it end to end rather
// than trusting the unit test alone.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("__lensGuestPreload", {
  loaded: true,
  // Present only if node integration leaked into the guest, which the clamp
  // forbids. Read from the guest page and asserted to be false.
  sawNodeGlobals: typeof process !== "undefined" && Boolean(process?.versions?.node),
});
