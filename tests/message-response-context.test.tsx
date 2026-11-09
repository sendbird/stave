import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageResponse } from "../src/components/ai-elements/message";
import { useAppStore } from "../src/store/app.store";

const previous = useAppStore.getState();
afterEach(() => useAppStore.setState({ repositoryPath: previous.repositoryPath, repositoryFiles: previous.repositoryFiles, activeWorkspaceId: previous.activeWorkspaceId, workspacePathById: previous.workspacePathById }));
const content = "[Source](src/example.ts) and `src/example.ts` and [/tmp/repo/src/example.ts](/tmp/repo/src/example.ts). [Documentation](https://example.com/docs).";
function setWorkspace() {
  useAppStore.setState({ repositoryPath: "/tmp/repo", activeWorkspaceId: "file-context", workspacePathById: { "file-context": "/tmp/repo" }, repositoryFiles: ["src/example.ts"] });
}

describe("MessageResponse file context", () => {
  test("ordinary task responses keep resolving relative paths and inline code by default", () => {
    setWorkspace();
    const html = renderToStaticMarkup(createElement(MessageResponse, null, content));
    expect(html.match(/href="src\/example.ts" data-message-file-link="true"/g)?.length).toBe(2);
    expect(html).toContain('href="https://example.com/docs"');
  });
  test("global responses render local paths as text while keeping external links", () => {
    setWorkspace();
    const html = renderToStaticMarkup(createElement(MessageResponse, { fileLinkContext: "none" }, content));
    expect(html).not.toContain("data-message-file-link");
    expect(html).not.toContain('href="src/example.ts"');
    expect(html).not.toContain('href="/tmp/repo/src/example.ts"');
    expect(html).toContain("src/example.ts");
    expect(html).toContain('href="https://example.com/docs"');
  });
});
