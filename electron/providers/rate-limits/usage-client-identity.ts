/**
 * How Stave identifies itself when it reads a provider's account-usage
 * endpoint.
 *
 * Stave is a third-party client. Presenting another vendor's client string is
 * misrepresentation, and it is also self-defeating: a provider investigating
 * unusual traffic cannot attribute it to a legitimate integration, and the
 * user cannot honestly say what was talking to their account. Every usage read
 * therefore names Stave, exactly as the provider RPC paths already do when
 * they send their client name during initialization.
 */
const version = process.env.npm_package_version ?? "0.0.0";

export const USAGE_CLIENT_NAME = "stave";

export const USAGE_CLIENT_VERSION = version;

export const USAGE_CLIENT_USER_AGENT = `${USAGE_CLIENT_NAME}/${version}`;
