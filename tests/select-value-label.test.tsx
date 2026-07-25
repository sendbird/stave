import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

describe("Select value labels", () => {
  test("renders the selected item label instead of its internal value", () => {
    const html = renderToStaticMarkup(
      createElement(
        Select,
        { value: "workspace" },
        createElement(SelectTrigger, null, createElement(SelectValue, null)),
        createElement(
          SelectContent,
          null,
          createElement(SelectItem, { value: "workspace" }, "Workspace root"),
          createElement(SelectItem, { value: "project" }, "Project root"),
        ),
      ),
    );

    expect(html).toContain(">Workspace root</span>");
    expect(html).not.toContain(">workspace</span>");
  });
});
