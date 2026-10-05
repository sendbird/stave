/**
 * Hardcoded user-facing string detector.
 *
 * Every string Stave shows to a person must come from the `src/locales`
 * catalogs so that English and Korean stay complete. This scanner walks the
 * TypeScript AST and reports literals that reach a user-facing position:
 *
 * - JSX text and string-valued JSX children (`<p>Saved</p>`, `{ok ? "Yes" : "No"}`)
 * - user-facing JSX attributes (`title`, `aria-label`, `placeholder`, `*Label`, ...)
 * - user-facing object properties (`label: "Settings"`, `description: ...`)
 * - variables, parameters and functions whose name says they hold UI copy
 *   (`const emptyLabel = "No tasks"`, `function statusLabel() { return "Running" }`)
 * - `toast(...)` titles and `window.confirm/alert/prompt` messages
 *
 * A literal that is intentionally not translated (model-facing prompt text,
 * protocol values, fixtures) carries an `i18n-ignore: <reason>` comment on the
 * same line or the line above.
 */
import ts from "typescript";

const USER_FACING_NAME =
  /^(?:label|title|description|placeholder|tooltip|message|hint|subtitle|heading|caption|body|detail|summary|text|copy|alt|helperText|emptyMessage|emptyState)$|(?:Label|Title|Description|Placeholder|Tooltip|Message|Hint|Subtitle|Heading|Caption|Text|Copy|Summary|Detail|Body)s?$/;
const USER_FACING_ATTRIBUTE = /^aria-(?:label|description|placeholder|roledescription|valuetext)$/;
const USER_FACING_FUNCTION =
  /^(?:describe|format|render)[A-Z]|(?:Label|Title|Description|Placeholder|Tooltip|Message|Hint|Subtitle|Heading|Caption|Text|Copy|Summary|Detail)s?(?:For|Of|From)?[A-Z]?\w*$/;
const NON_COPY_NAME =
  /(?:Id|Ids|Key|Keys|Path|Paths|Url|Urls|ClassName|Prefix|Suffix|Pattern|Regex|Selector|Token|Tokens|Kind|Type|Mode|Variant)$/;
const TOAST_METHODS = new Set(["message", "success", "warning", "error", "info"]);
const IGNORE_MARKER = "i18n-ignore";

/** Remove interpolation, allowlisted terms, and keyboard glyphs before judging prose. */
export function stripNonProse(value, terms) {
  let text = value
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\$\{[^}]*\}/g, " ")
    .replace(/<\/?[A-Za-z0-9]+\s*\/?>/g, " ");
  for (const term of terms) {
    text = text.replace(termPattern(term), " ");
  }
  return text;
}

const termPatterns = new Map();
function termPattern(term) {
  let pattern = termPatterns.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g");
    termPatterns.set(term, pattern);
  }
  return pattern;
}

/** Attribute values: copy, or a bare lowercase word such as `aria-label="close"`. */
export function isAttributeProse(value, terms) {
  return isCodeProse(value, terms) || /^[A-Za-z]{2,}$/.test(stripNonProse(value, terms).trim());
}

/** JSX text: any run of two or more Latin letters outside allowlisted terms. */
export function isJsxProse(value, terms) {
  return /[A-Za-z]{2,}/.test(stripNonProse(value, terms));
}

/**
 * Strings in code positions: require something that reads like copy so that
 * identifiers, CSS values, enum members and paths do not trip the guard.
 */
export function isCodeProse(value, terms) {
  const raw = value.trim();
  if (!raw) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|file:|data:|\.{0,2}\/|#|@|--)/i.test(raw)) {
    return false;
  }
  const text = stripNonProse(raw, terms).trim();
  if (!/[A-Za-z]{2,}/.test(text)) return false;
  const words = text.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
  if (words.length === 0) return false;
  if (words.length === 1) {
    const word = words[0].replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    // A single capitalized word ("Settings", "Save") is copy; lowercase,
    // camelCase, kebab-case, snake_case and ALLCAPS tokens are code.
    return /^[A-Z][a-z]+$/.test(word);
  }
  // Several words: copy unless every word is an identifier-like token such as
  // a class list ("flex items-center") or an option list ("low medium high").
  const proseWords = words.filter(
    (word) => /^[A-Z]?[a-z]+[,.!?:;…)']*$/.test(word.replace(/^[("'`]+/, "")),
  );
  if (proseWords.length === 0) return false;
  const allLowerTokens = words.every((word) => /^[a-z0-9:_./-]+$/.test(word));
  if (allLowerTokens && !/[,.!?…]/.test(text) && words.some((word) => /[-_:/]/.test(word))) {
    return false;
  }
  return true;
}

function nameOf(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return null;
  if (ts.isJsxNamespacedName?.(node)) return `${node.namespace.text}:${node.name.text}`;
  return node.getText?.() ?? null;
}

/** Collect string fragments an expression can evaluate to directly. */
function stringFragments(expression) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isNonNullExpression(node)) {
      visit(node.expression);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      out.push({ node, text: node.text });
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ${} ");
      out.push({ node, text });
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.whenTrue);
      visit(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        visit(node.right);
        if (kind !== ts.SyntaxKind.AmpersandAmpersandToken) visit(node.left);
        return;
      }
      if (kind === ts.SyntaxKind.PlusToken) {
        visit(node.left);
        visit(node.right);
      }
    }
  };
  visit(expression);
  return out;
}

function lineText(sourceFile, line) {
  const starts = sourceFile.getLineStarts();
  if (line < 0 || line >= starts.length) return "";
  return sourceFile.text.slice(starts[line], starts[line + 1] ?? sourceFile.text.length);
}

/** A marker counts on its own line, or on a comment-only line directly above. */
function markerCovers(sourceFile, line) {
  if (lineText(sourceFile, line).includes(IGNORE_MARKER)) return true;
  const above = lineText(sourceFile, line - 1).trim();
  return /^(?:\/\/|\/\*|\*|\{\/\*)/.test(above) && above.includes(IGNORE_MARKER);
}

function isIgnored(sourceFile, node) {
  const lineOf = (target) => sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile)).line;
  if (markerCovers(sourceFile, lineOf(node))) return true;
  // Multi-line JSX attributes, object members, declarations and returns:
  // honor a marker on the enclosing construct's first line as well.
  let parent = node.parent;
  for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parent) {
    if (
      ts.isJsxAttribute(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isVariableStatement(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isReturnStatement(parent) ||
      ts.isCallExpression(parent)
    ) {
      if (markerCovers(sourceFile, lineOf(parent))) return true;
    }
  }
  return false;
}

function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
      return nameOf(current.name);
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (parent && ts.isVariableDeclaration(parent)) return nameOf(parent.name);
      if (parent && ts.isPropertyAssignment(parent)) return nameOf(parent.name);
      return null;
    }
    if (ts.isSourceFile(current) || ts.isClassDeclaration(current)) return null;
    current = current.parent;
  }
  return null;
}

/** `STATUS_LABELS` → `statusLabels` so constant tables follow the same naming rules. */
function normalizeName(name) {
  if (!name || !/^[A-Z0-9_]+$/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/_+([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function isUserFacingName(rawName) {
  const name = normalizeName(rawName);
  return Boolean(name) && USER_FACING_NAME.test(name) && !NON_COPY_NAME.test(name);
}

function isUserFacingFunction(rawName) {
  const name = normalizeName(rawName);
  return Boolean(name) && USER_FACING_FUNCTION.test(name) && !NON_COPY_NAME.test(name);
}

function isToastCall(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text === "toast";
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return callee.expression.text === "toast" && TOAST_METHODS.has(callee.name.text);
  }
  return false;
}

function isNativeDialogCall(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return ["alert", "confirm", "prompt"].includes(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "window" &&
    ["alert", "confirm", "prompt"].includes(callee.name.text)
  );
}

/**
 * Scan one source file and return findings.
 * @param {string} fileName repository-relative path
 * @param {string} sourceText file contents
 * @param {{ terms: string[] }} options
 */
export function scanSource(fileName, sourceText, { terms = [] } = {}) {
  const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const findings = [];
  const seen = new Set();

  const report = (node, text, rule) => {
    if (seen.has(node.pos)) return;
    if (isIgnored(sourceFile, node)) return;
    seen.add(node.pos);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      file: fileName,
      line: line + 1,
      column: character + 1,
      rule,
      text: text.replace(/\s+/g, " ").trim().slice(0, 120),
    });
  };
  const checkExpression = (expression, rule, judge = isCodeProse) => {
    for (const fragment of stringFragments(expression)) {
      if (judge(fragment.text, sortedTerms)) report(fragment.node, fragment.text, rule);
    }
  };
  const checkObjectLiteral = (object, rule) => {
    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (ts.isObjectLiteralExpression(property.initializer)) {
          checkObjectLiteral(property.initializer, rule);
        } else if (ts.isArrayLiteralExpression(property.initializer)) {
          for (const element of property.initializer.elements) {
            if (ts.isObjectLiteralExpression(element)) checkObjectLiteral(element, rule);
            else checkExpression(element, rule);
          }
        } else {
          checkExpression(property.initializer, rule);
        }
      }
    }
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (isJsxProse(node.text, sortedTerms)) report(node, node.text, "jsx-text");
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      checkExpression(node.expression, "jsx-expression", isJsxProse);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = nameOf(node.name);
      if (name && (isUserFacingName(name) || USER_FACING_ATTRIBUTE.test(name))) {
        const initializer = node.initializer;
        if (ts.isStringLiteral(initializer)) {
          if (isAttributeProse(initializer.text, sortedTerms)) report(initializer, initializer.text, "jsx-attribute");
        } else if (ts.isJsxExpression(initializer) && initializer.expression) {
          checkExpression(initializer.expression, "jsx-attribute", isAttributeProse);
        }
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = nameOf(node.name);
      if (isUserFacingName(name)) checkExpression(node.initializer, "object-property");
    } else if (ts.isShorthandPropertyAssignment(node)) {
      // Value lives in a variable; that declaration is checked on its own.
    } else if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = nameOf(node.name);
      if (isUserFacingName(name)) {
        if (ts.isObjectLiteralExpression(node.initializer)) {
          checkObjectLiteral(node.initializer, "copy-variable");
        } else if (ts.isArrayLiteralExpression(node.initializer)) {
          for (const element of node.initializer.elements) checkExpression(element, "copy-variable");
        } else {
          let initializer = node.initializer;
          while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression?.(initializer)) initializer = initializer.expression;
          if (ts.isObjectLiteralExpression(initializer)) checkObjectLiteral(initializer, "copy-variable");
          else checkExpression(initializer, "copy-variable");
        }
      }
    } else if (ts.isBindingElement(node) && node.initializer) {
      const name = nameOf(node.propertyName ?? node.name);
      if (isUserFacingName(name)) checkExpression(node.initializer, "copy-default");
    } else if (ts.isParameter(node) && node.initializer) {
      const name = nameOf(node.name);
      if (isUserFacingName(name)) checkExpression(node.initializer, "copy-default");
    } else if (ts.isReturnStatement(node) && node.expression) {
      const name = enclosingFunctionName(node);
      if (isUserFacingFunction(name)) {
        checkExpression(node.expression, "copy-return");
      }
    } else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      const parent = node.parent;
      const name = parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) ? nameOf(parent.name) : null;
      if (isUserFacingFunction(name)) {
        checkExpression(node.body, "copy-return");
      }
    } else if (ts.isCallExpression(node)) {
      if (isToastCall(node)) {
        const [title, options] = node.arguments;
        if (title) checkExpression(title, "toast", isJsxProse);
        if (options && ts.isObjectLiteralExpression(options)) checkObjectLiteral(options, "toast");
      } else if (isNativeDialogCall(node)) {
        for (const argument of node.arguments) checkExpression(argument, "native-dialog", isJsxProse);
      }
    } else if (ts.isCaseClause(node)) {
      // Switch-based label maps are covered through `copy-return`.
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}
