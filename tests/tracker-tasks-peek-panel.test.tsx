import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TasksPeekPanel } from "@/components/layout/tasks/TasksPeekPanel";
import { TRACKER_TASKS_PEEK_DEFAULT_PX } from "@/lib/tracker-tasks/peek-size";

describe("TasksPeekPanel", () => {
  test("stays mounted while closed so the list can reclaim the track", () => {
    const html = renderToStaticMarkup(
      createElement(
        TasksPeekPanel,
        {
          open: false,
          title: "CRN-1",
          width: TRACKER_TASKS_PEEK_DEFAULT_PX,
          onClose: () => {},
          onWidthChange: () => {},
        },
        "body",
      ),
    );
    expect(html).toContain("data-stave-peek-panel");
    expect(html).toContain('data-open="false"');
    expect(html).toContain("--stave-peek-width:480px");
    expect(html).not.toContain("Resize ticket peek");
  });

  test("exposes a resize rail while open", () => {
    const html = renderToStaticMarkup(
      createElement(
        TasksPeekPanel,
        {
          open: true,
          title: "CRN-1",
          width: 560,
          onClose: () => {},
          onWidthChange: () => {},
          onNavigate: () => {},
        },
        "body",
      ),
    );
    expect(html).toContain("Resize ticket peek");
    expect(html).toContain('aria-valuenow="560"');
    expect(html).toContain("Previous ticket");
    expect(html).toContain("Next ticket");
  });
});
