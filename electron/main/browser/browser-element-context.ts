/**
 * Shared, dependency-free extraction helpers embedded into Lens guest pages.
 * Electron main treats every returned value as untrusted and normalizes it
 * again before it can enter session state or provider-facing context.
 */
export function getLensElementContextScript(): string {
  return `
  const STAVE_SAFE_ATTRIBUTE_NAMES = [
    "alt",
    "aria-describedby",
    "aria-label",
    "aria-labelledby",
    "data-cy",
    "data-test",
    "data-testid",
    "name",
    "placeholder",
    "role",
    "title",
    "type",
  ];

  function staveBoundText(value, maxLength) {
    return String(value || "")
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function staveRectToPlain(rect) {
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function staveBuildSelector(element) {
    if (element.id) return "#" + CSS.escape(element.id);
    const stableAttributes = [
      "data-testid",
      "data-cy",
      "data-test",
      "data-id",
      "aria-label",
    ];
    for (const attribute of stableAttributes) {
      const value = element.getAttribute(attribute);
      if (value) {
        return (
          element.tagName.toLowerCase() +
          "[" +
          attribute +
          "=" +
          JSON.stringify(value) +
          "]"
        );
      }
    }

    const parts = [];
    let current = element;
    while (
      current &&
      current !== document.documentElement &&
      parts.length < 8
    ) {
      if (current.id) {
        parts.unshift("#" + CSS.escape(current.id));
        break;
      }
      let segment = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (candidate) => candidate.tagName === current.tagName,
        );
        if (sameTagSiblings.length > 1) {
          segment +=
            ":nth-of-type(" + (sameTagSiblings.indexOf(current) + 1) + ")";
        }
      }
      parts.unshift(segment);
      current = parent;
    }
    return parts.join(" > ");
  }

  function staveAccessibleName(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return staveBoundText(ariaLabel, 1000);

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const label = labelledBy
        .split(/\\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .filter(Boolean)
        .join(" ");
      if (label) return staveBoundText(label, 1000);
    }

    if (element.labels && element.labels.length > 0) {
      const label = Array.from(element.labels)
        .map((candidate) => candidate.textContent || "")
        .join(" ");
      if (label) return staveBoundText(label, 1000);
    }

    for (const attribute of ["alt", "title", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (value) return staveBoundText(value, 1000);
    }
    return staveBoundText(element.textContent || "", 1000);
  }

  function staveElementRole(element) {
    const explicit = element.getAttribute("role");
    if (explicit) return staveBoundText(explicit, 128).toLowerCase();

    const tag = element.tagName.toLowerCase();
    if (tag === "a" && element.hasAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "img") return "img";
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    if (tag === "aside") return "complementary";
    if (tag === "ul" || tag === "ol") return "list";
    if (tag === "li") return "listitem";
    if (tag === "table") return "table";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "button" || type === "submit" || type === "reset") {
        return "button";
      }
      return "textbox";
    }
    return "";
  }

  function staveSafeAttributes(element) {
    const attributes = {};
    for (const name of STAVE_SAFE_ATTRIBUTE_NAMES) {
      const value = element.getAttribute(name);
      if (value != null && value !== "") {
        attributes[name] = staveBoundText(value, 1000);
      }
    }
    return attributes;
  }

  function staveElementHint(element) {
    return {
      selector: staveBuildSelector(element),
      tagName: element.tagName.toLowerCase(),
      elementId: element.id || "",
      accessibleName: staveAccessibleName(element),
      role: staveElementRole(element),
      text: staveBoundText(element.textContent || "", 1000),
    };
  }

  function staveSafeOuterHTML(element) {
    const tagName = element.tagName.toLowerCase();
    const id = element.id
      ? ' id="' +
        String(element.id)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;") +
        '"'
      : "";
    const text = staveBoundText(element.textContent || "", 2000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return "<" + tagName + id + ">" + text + "</" + tagName + ">";
  }

  function staveReactContext(element, enabled) {
    if (!enabled) {
      return { debugSource: null, componentNameChain: null };
    }
    try {
      const fiberKey = Object.keys(element).find(
        (key) =>
          key.startsWith("__reactFiber$") ||
          key.startsWith("__reactInternalInstance$"),
      );
      if (!fiberKey) {
        return { debugSource: null, componentNameChain: null };
      }

      let fiber = element[fiberKey];
      let debugSource = null;
      for (let index = 0; index < 10 && fiber; index += 1) {
        if (fiber._debugSource) {
          debugSource = {
            fileName: fiber._debugSource.fileName,
            lineNumber: fiber._debugSource.lineNumber,
            columnNumber: fiber._debugSource.columnNumber,
          };
          break;
        }
        fiber = fiber.return;
      }

      const componentNameChain = [];
      fiber = element[fiberKey];
      for (let index = 0; index < 24 && fiber; index += 1) {
        const type = fiber.type;
        const name =
          typeof type === "function"
            ? type.displayName || type.name
            : type && typeof type === "object"
              ? type.displayName || type.name
              : null;
        if (
          typeof name === "string" &&
          name &&
          !componentNameChain.includes(name)
        ) {
          componentNameChain.push(name);
        }
        fiber = fiber.return;
      }
      componentNameChain.reverse();
      return { debugSource, componentNameChain };
    } catch (_) {
      return { debugSource: null, componentNameChain: null };
    }
  }

  function staveElementContext(element, extractDebugSource) {
    const ancestors = [];
    let ancestor = element.parentElement;
    while (
      ancestor &&
      ancestor !== document.documentElement &&
      ancestors.length < 6
    ) {
      ancestors.push(staveElementHint(ancestor));
      ancestor = ancestor.parentElement;
    }

    const nearby = [];
    if (element.parentElement) {
      nearby.push({
        relation: "parent",
        ...staveElementHint(element.parentElement),
      });
    }
    if (element.previousElementSibling) {
      nearby.push({
        relation: "previous",
        ...staveElementHint(element.previousElementSibling),
      });
    }
    if (element.nextElementSibling) {
      nearby.push({
        relation: "next",
        ...staveElementHint(element.nextElementSibling),
      });
    }
    for (const child of Array.from(element.children).slice(0, 3)) {
      nearby.push({ relation: "child", ...staveElementHint(child) });
    }

    const reactContext = staveReactContext(element, extractDebugSource);
    return {
      selector: staveBuildSelector(element),
      bounds: staveRectToPlain(element.getBoundingClientRect()),
      element: {
        tagName: element.tagName.toLowerCase(),
        id: element.id || "",
        classList: Array.from(element.classList),
      },
      accessibleName: staveAccessibleName(element),
      role: staveElementRole(element),
      attributes: staveSafeAttributes(element),
      ancestors,
      nearby,
      computedStyles: {},
      outerHTML: staveSafeOuterHTML(element),
      textContent: staveBoundText(element.textContent || "", 4000),
      debugSource: reactContext.debugSource,
      componentNameChain: reactContext.componentNameChain,
    };
  }

  function staveAreaContext(rect, overlayRoot) {
    const points = [
      [rect.x + rect.width / 2, rect.y + rect.height / 2],
      [rect.x + 1, rect.y + 1],
      [rect.x + Math.max(1, rect.width - 1), rect.y + 1],
      [rect.x + 1, rect.y + Math.max(1, rect.height - 1)],
      [
        rect.x + Math.max(1, rect.width - 1),
        rect.y + Math.max(1, rect.height - 1),
      ],
    ];
    const elements = [];
    for (const [x, y] of points) {
      for (const element of document.elementsFromPoint(x, y)) {
        if (
          !element ||
          overlayRoot?.contains(element) ||
          elements.includes(element)
        ) {
          continue;
        }
        elements.push(element);
        if (elements.length >= 8) break;
      }
      if (elements.length >= 8) break;
    }

    return {
      bounds: staveRectToPlain(rect),
      attributes: {},
      ancestors: [],
      nearby: elements.map((element) => ({
        relation: "within",
        ...staveElementHint(element),
      })),
      computedStyles: {},
    };
  }

  function stavePageIdentity(documentId) {
    return {
      url: window.location.href,
      title: document.title || "",
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      scroll: {
        x: window.scrollX,
        y: window.scrollY,
      },
      documentId,
    };
  }
`;
}
