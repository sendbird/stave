import { describe, expect, test } from "bun:test";
import { patchScopedSourceBlock } from "../scripts/patch-better-sqlite3-electron.mjs";

describe("better-sqlite3 Electron patching", () => {
  test("patches only the targeted NODE_GETTER block", () => {
    const source = `NODE_METHOD(Statement::JS_bind) {
\tStatement* stmt = Unwrap<Statement>(PROPERTY_HOLDER(info));
}

NODE_GETTER(Statement::JS_busy) {
\tStatement* stmt = Unwrap<Statement>(PROPERTY_HOLDER(info));
\tinfo.GetReturnValue().Set(stmt->busy);
}
`;

    const patched = patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Statement::JS_busy) {",
      from: "Unwrap<Statement>(PROPERTY_HOLDER(info))",
      to: "Unwrap<Statement>(info.HolderV2())",
    });

    expect(patched).toContain("NODE_METHOD(Statement::JS_bind) {\n\tStatement* stmt = Unwrap<Statement>(PROPERTY_HOLDER(info));");
    expect(patched).toContain("NODE_GETTER(Statement::JS_busy) {\n\tStatement* stmt = Unwrap<Statement>(info.HolderV2());");
  });

  test("is idempotent when the target block is already patched", () => {
    const source = `NODE_GETTER(Database::JS_open) {
\tinfo.GetReturnValue().Set(Unwrap<Database>(info.HolderV2())->open);
}
`;

    const patched = patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Database::JS_open) {",
      from: "Unwrap<Database>(PROPERTY_HOLDER(info))",
      to: "Unwrap<Database>(info.HolderV2())",
    });

    expect(patched).toBe(source);
  });

  test("skips when the signature exists but the expected line is not in the target block", () => {
    const source = `NODE_METHOD(Database::JS_close) {
\tDatabase* db = Unwrap<Database>(PROPERTY_HOLDER(info));
}

NODE_GETTER(Database::JS_inTransaction) {
\treturn;
}
`;

    const patched = patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Database::JS_inTransaction) {",
      from: "Unwrap<Database>(PROPERTY_HOLDER(info))",
      to: "Unwrap<Database>(info.HolderV2())",
    });

    expect(patched).toBe(source);
  });
});
