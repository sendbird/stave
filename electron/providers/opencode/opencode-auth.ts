/**
 * OpenCode owns provider authentication; Stave never reads, stores or moves
 * OpenCode credentials. This is the guidance shown when OpenCode reports that
 * a provider needs authentication or lists no usable models.
 */
export const OPENCODE_AUTHENTICATION_HELP =
  "Connect a provider in OpenCode: run `opencode auth login`, or for Vercel AI Gateway run `npx vercel ai-gateway setup --agent opencode`.";
