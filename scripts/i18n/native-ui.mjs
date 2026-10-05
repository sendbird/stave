/** Scan only text flowing into Electron native dialog and menu APIs. */
import ts from "typescript";

const DIALOG_FIELDS = new Set(["title", "message", "detail", "buttonLabel", "checkboxLabel"]);
const MENU_FIELDS = new Set(["label", "sublabel", "toolTip", "tooltip"]);
const DIALOG_METHODS = new Set(["showMessageBox", "showMessageBoxSync", "showOpenDialog", "showOpenDialogSync", "showSaveDialog", "showSaveDialogSync"]);

const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};
const propertyName = (node) => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null;
const isScope = (node) => ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node);
function scopeOf(node) {
  let current = node.parent;
  while (current && !isScope(current)) current = current.parent;
  return current;
}

/** Reuses scanSource's AST, prose judge, reporting and ignore handling. */
export function scanNativeUi(sourceFile, checkExpression) {
  const bindings = new Map();
  const dialogNames = new Set(["dialog"]);
  const menuNames = new Set(["Menu"]);
  const namespaces = new Set();
  const pushes = [];
  const assignments = [];
  const calls = [];
  const register = (name, scope, declaration) => {
    if (!bindings.has(scope)) bindings.set(scope, new Map());
    bindings.get(scope).set(name, declaration);
  };
  const index = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "electron") {
      const names = node.importClause?.namedBindings;
      if (names && ts.isNamespaceImport(names)) namespaces.add(names.name.text);
      if (names && ts.isNamedImports(names)) {
        for (const specifier of names.elements) {
          const original = specifier.propertyName?.text ?? specifier.name.text;
          if (original === "dialog") dialogNames.add(specifier.name.text);
          if (original === "Menu") menuNames.add(specifier.name.text);
        }
      }
    }
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      let scope = scopeOf(node);
      if (ts.isVariableDeclaration(node) && !(node.parent.flags & ts.NodeFlags.BlockScoped)) {
        while (scope && !ts.isSourceFile(scope) && !ts.isFunctionLike(scope)) scope = scopeOf(scope);
      }
      register(node.name.text, scope, node);
    }
    if (ts.isCallExpression(node)) {
      calls.push(node);
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "push") pushes.push(node);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) assignments.push(node);
    ts.forEachChild(node, index);
  };
  index(sourceFile);

  const bindingFor = (identifier) => {
    for (let scope = scopeOf(identifier); scope; scope = scopeOf(scope)) {
      const declaration = bindings.get(scope)?.get(identifier.text);
      if (declaration) return declaration;
    }
    return null;
  };
  const sameBinding = (left, right) => ts.isIdentifier(left) && ts.isIdentifier(right) && bindingFor(left) === bindingFor(right) && left.text === right.text;
  const resolve = (expression, seen = new Set()) => {
    const node = unwrap(expression);
    if (!node || seen.has(node)) return [];
    const next = new Set(seen).add(node);
    if (ts.isIdentifier(node)) {
      const declaration = bindingFor(node);
      if (!declaration || next.has(declaration)) return [];
      next.add(declaration);
      const values = resolve(declaration.initializer, next);
      for (const assignment of assignments) {
        if (sameBinding(assignment.left, node)) values.push(...resolve(assignment.right, next));
      }
      for (const call of pushes) {
        if (sameBinding(call.expression.expression, node)) {
          for (const argument of call.arguments) values.push(...resolve(argument, next));
        }
      }
      return values;
    }
    if (ts.isConditionalExpression(node)) return [...resolve(node.whenTrue, next), ...resolve(node.whenFalse, next)];
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) return [...resolve(node.left, next), ...resolve(node.right, next)];
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return resolve(node.expression, next);
    return [node];
  };
  const values = (expression, rule) => {
    for (const node of resolve(expression)) checkExpression(node, rule);
  };
  const array = (expression, visitor, seen = new Set()) => {
    if (!expression || seen.has(expression)) return;
    const next = new Set(seen).add(expression);
    for (const node of resolve(expression)) {
      if (ts.isArrayLiteralExpression(node)) {
        for (const element of node.elements) array(element, visitor, next);
      } else visitor(node);
    }
  };
  const object = (expression, visitor, seen = new Set()) => {
    const node = unwrap(expression);
    if (!node || seen.has(node)) return;
    const next = new Set(seen).add(node);
    if (ts.isIdentifier(node)) {
      object(bindingFor(node)?.initializer, visitor, next);
      for (const assignment of assignments) {
        if (sameBinding(assignment.left, node)) object(assignment.right, visitor, next);
        if (ts.isPropertyAccessExpression(assignment.left) && sameBinding(assignment.left.expression, node)) visitor(assignment.left.name.text, assignment.right);
      }
      return;
    }
    for (const resolved of resolve(node)) {
      if (!ts.isObjectLiteralExpression(resolved)) continue;
      for (const property of resolved.properties) {
        if (ts.isSpreadAssignment(property)) object(property.expression, visitor, next);
        else if (ts.isPropertyAssignment(property)) visitor(propertyName(property.name), property.initializer);
        else if (ts.isShorthandPropertyAssignment(property)) visitor(property.name.text, property.name);
      }
    }
  };
  const dialog = (expression) => object(expression, (name, value) => {
    if (DIALOG_FIELDS.has(name)) values(value, "electron-dialog");
    if (name === "buttons") array(value, (element) => values(element, "electron-dialog"));
    if (name === "filters") array(value, (filter) => object(filter, (key, text) => {
      if (key === "name") values(text, "electron-dialog");
    }));
  });
  const menu = (expression, seen = new Set()) => {
    if (!expression || seen.has(expression)) return;
    const next = new Set(seen).add(expression);
    array(expression, (item) => object(item, (name, value) => {
      if (MENU_FIELDS.has(name)) values(value, "electron-menu");
      if (name === "submenu") menu(value, next);
    }));
  };
  const receiverMatches = (expression, names, original, seen = new Set()) => {
    const node = unwrap(expression);
    if (!node || seen.has(node)) return false;
    const next = new Set(seen).add(node);
    if (ts.isIdentifier(node)) {
      if (names.has(node.text) && !bindingFor(node)) return true;
      return receiverMatches(bindingFor(node)?.initializer, names, original, next);
    }
    return ts.isPropertyAccessExpression(node) && node.name.text === original && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text) && !bindingFor(node.expression);
  };
  for (const call of calls) {
    let callee = unwrap(call.expression);
    if (ts.isIdentifier(callee)) callee = unwrap(bindingFor(callee)?.initializer);
    if (!callee || !(ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))) continue;
    const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : null;
    if (receiverMatches(callee.expression, dialogNames, "dialog")) {
      if (method === "showErrorBox") {
        for (const argument of call.arguments) values(argument, "electron-dialog");
      } else if (DIALOG_METHODS.has(method)) dialog(call.arguments.at(-1));
    } else if (method === "buildFromTemplate" && receiverMatches(callee.expression, menuNames, "Menu")) menu(call.arguments[0]);
  }
}
