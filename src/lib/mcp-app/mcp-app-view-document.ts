/**
 * What Stave adds to an MCP App view's document, ahead of the view's own
 * scripts.
 *
 * A view runs without `allow-same-origin`, so its document has an opaque
 * origin, and there reading or writing `document.cookie` throws
 * `SecurityError`. Views read cookies without a guard, because hosts that give
 * a view an origin do not throw. A view can draw its content,
 * report its height, then lose everything it drew to that one
 * uncaught error, which leaves a frame as tall as the card with nothing in
 * it.
 *
 * The script gives the document a cookie jar of its own: `document.cookie`
 * reads and writes a list held in memory, empty at first and gone with the
 * document. Nothing is stored, sent, or shared with another view, and the
 * sandbox is unchanged. Web storage and IndexedDB still throw.
 */

/**
 * The jar, as script source. It leaves `document.cookie` alone where reading
 * it works. A cookie written with `Max-Age` of zero or less, or with an
 * `Expires` date that has passed, is removed; any other stays until the
 * document goes away.
 */
export const MCP_APP_VIEW_COOKIE_JAR_SOURCE = `(function () {
  try {
    void document.cookie;
    return;
  } catch (error) {}
  var jar = new Map();
  function write(value) {
    var parts = String(value).split(";");
    var pair = parts[0];
    var at = pair.indexOf("=");
    var name = at < 0 ? "" : pair.slice(0, at).trim();
    var data = (at < 0 ? pair : pair.slice(at + 1)).trim();
    if (!name && !data) return;
    var maxAge = null;
    var expires = null;
    for (var index = 1; index < parts.length; index += 1) {
      var equals = parts[index].indexOf("=");
      if (equals < 0) continue;
      var attribute = parts[index].slice(0, equals).trim().toLowerCase();
      var text = parts[index].slice(equals + 1).trim();
      if (attribute === "max-age" && /^-?\\d+$/.test(text)) maxAge = Number(text);
      if (attribute === "expires" && !isNaN(Date.parse(text))) expires = Date.parse(text);
    }
    var gone = maxAge !== null ? maxAge <= 0 : expires !== null && expires <= Date.now();
    if (gone) jar.delete(name);
    else jar.set(name, data);
  }
  function read() {
    var pairs = [];
    jar.forEach(function (data, name) {
      pairs.push(name ? name + "=" + data : data);
    });
    return pairs.join("; ");
  }
  try {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      enumerable: true,
      get: read,
      set: write,
    });
  } catch (error) {}
})();`;

/** The element both delivery paths place before anything the view wrote. */
export const MCP_APP_VIEW_DOCUMENT_PRELUDE = `<script>${MCP_APP_VIEW_COOKIE_JAR_SOURCE}</script>`;
