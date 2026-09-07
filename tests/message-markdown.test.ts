import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "@/components/ai-elements/message-markdown";
import { markdownStyles } from "@/components/ai-elements/message-markdown.styles";
import { sx } from "@/components/ads/utils/stylex";
import { hardenSetextHeadings } from "@/components/ai-elements/message-markdown.setext";
import {
  formatFileLinkLocation,
  resolveWorkspaceFileLink,
} from "@/lib/message-file-links";

function render(content: string): string {
  return renderToStaticMarkup(
    createElement(MarkdownMessage, {
      content,
      messageCodeFontSize: 14,
      messageFontSize: 18,
    }),
  );
}

/**
 * The reported regression: assistant prose "sometimes renders like a heading".
 *
 * Two independent defects compounded. A sentence followed immediately by
 * `---` is a CommonMark *setext* heading, so the sentence became an `<h2>`
 * where the model meant a divider; and `MarkdownMessage` had no h1–h6
 * component overrides at all, so that `<h2>` fell through to the user-agent
 * sheet at 1.5em bold — with the ADS reset having just removed the UA
 * `margin-block` that used to separate it from the prose, leaving an outsized
 * bold line jammed into the paragraph flow.
 */
describe("MarkdownMessage headings", () => {
  test("a sentence above a rule stays a paragraph and the rule stays a rule", () => {
    const html = render("Deployed to staging.\n---\nNext up: production.");
    expect(html).not.toContain("<h2");
    expect(html).toContain("<hr");
    expect(html).toContain("Deployed to staging.");
  });

  test("a real heading is still a heading, and is styled rather than left to the UA", () => {
    const html = render("## What changed\n\nThe runtime now retries.");
    expect(html).toContain("<h2");
    // The whole defect was an unstyled element: a class here is the fix.
    expect(html).toContain(sx(markdownStyles.heading));
    expect(html).toContain(sx(markdownStyles.heading2));
  });

  test("every heading level is styled, so none of them can fall back to 2em bold", () => {
    for (const [hashes, tag] of [
      ["#", "h1"],
      ["##", "h2"],
      ["###", "h3"],
      ["####", "h4"],
      ["#####", "h5"],
      ["######", "h6"],
    ] as const) {
      const html = render(`${hashes} Title`);
      expect(html).toContain(`<${tag} class=`);
      expect(html).toContain(sx(markdownStyles.heading));
    }
  });

  test("the hardening leaves unambiguous markdown exactly as written", () => {
    // A rule already separated by a blank line, a front-matter fence, a
    // dashed list, a table delimiter and a fenced code block are all correct
    // already; rewriting any of them would trade one wrong render for another.
    for (const source of [
      "Text.\n\n---\n\nMore.",
      "- one\n---",
      "| a |\n| --- |\n| b |",
      "```\ncode\n---\n```",
      "no dashes at all",
    ]) {
      expect(hardenSetextHeadings(source)).toBe(source);
    }
  });

  test("a YAML-looking block is rescued too: CommonMark has no front matter", () => {
    // `---\ntitle: x\n---` is a thematic break followed by a setext heading
    // in CommonMark — there is no front-matter extension enabled — so the
    // closing fence turns `title: x` into an <h2>. The same rescue applies.
    expect(hardenSetextHeadings("---\ntitle: x\n---")).toBe(
      "---\ntitle: x\n\n---",
    );
  });

  test("only a three-dash rule is rescued: a shorter underline would become a list", () => {
    expect(hardenSetextHeadings("Title\n-")).toBe("Title\n-");
    expect(hardenSetextHeadings("Title\n---")).toBe("Title\n\n---");
  });
});

describe("MarkdownMessage", () => {
  test("renders GFM tables as HTML table markup", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: [
          "Key improvements:",
          "",
          "| Before | After |",
          "| --- | --- |",
          "| Generic | Concrete |",
        ].join("\n"),
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<td");
  });

  test("renders workspace file links as inline file chips", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content:
          "Open [chat panel](/tmp/stave/src/components/session/ChatPanel.tsx:42)",
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
          }),
      }),
    );

    expect(html).toContain('data-message-file-link="true"');
    expect(html).toContain(
      'aria-label="Open src/components/session/ChatPanel.tsx (reference L42)"',
    );
    expect(html).toContain("ChatPanel.tsx");
    expect(html).toContain("L42");
  });

  test("upgrades inline code workspace file references into file chips", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content:
          "Check `src/components/session/ChatPanel.tsx#L42` for the fix.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
          }),
      }),
    );

    expect(html).toContain('data-message-file-link="true"');
    expect(html).toContain(
      'aria-label="Open src/components/session/ChatPanel.tsx (reference L42)"',
    );
    expect(html).toContain("ChatPanel.tsx");
    expect(html).toContain("L42");
  });

  test("upgrades slash-based inline file references even before project indexing catches up", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Create `src/components/new/NewPanel.tsx` from this block.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href, allowUnknownPath }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
            allowUnknownPaths: allowUnknownPath,
          }),
      }),
    );

    expect(html).toContain('data-message-file-link="true"');
    expect(html).toContain("NewPanel.tsx");
  });

  test("keeps slash-delimited non-file inline code as code", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Track `owner/repo` separately.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href, allowUnknownPath }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
            allowUnknownPaths: allowUnknownPath,
          }),
      }),
    );

    expect(html).not.toContain('data-message-file-link="true"');
    expect(html).toContain("<code");
    expect(html).toContain("owner/repo");
  });

  test("passes code-fence file metadata to the block renderer", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    let captured: {
      code: string;
      language?: string;
      fileHref?: string;
      resolvedFilePath?: string;
    } | null = null;

    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: [
          "```tsx path=src/components/session/ChatPanel.tsx",
          "export const value = 1;",
          "```",
        ].join("\n"),
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href, allowUnknownPath }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
            allowUnknownPaths: allowUnknownPath,
          }),
        renderBlockCode: ({ code, language, fileHref, resolvedFileLink }) => {
          captured = {
            code,
            language,
            fileHref,
            resolvedFilePath: resolvedFileLink?.filePath,
          };
          return createElement("pre", null, code);
        },
      }),
    );

    expect(html).toContain("export const value = 1;");
    expect(captured).toEqual({
      code: "export const value = 1;",
      language: "tsx",
      fileHref: "src/components/session/ChatPanel.tsx",
      resolvedFilePath: "src/components/session/ChatPanel.tsx",
    });
  });

  test("ignores non-file code-fence title metadata", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    let captured: {
      code: string;
      language?: string;
      fileHref?: string;
      resolvedFilePath?: string;
    } | null = null;

    renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: ["```txt title=owner/repo", "hello", "```"].join("\n"),
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href, allowUnknownPath }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
            allowUnknownPaths: allowUnknownPath,
          }),
        renderBlockCode: ({ code, language, fileHref, resolvedFileLink }) => {
          captured = {
            code,
            language,
            fileHref,
            resolvedFilePath: resolvedFileLink?.filePath,
          };
          return createElement("pre", null, code);
        },
      }),
    );

    expect(captured).toEqual({
      code: "hello",
      language: "txt",
      fileHref: undefined,
      resolvedFilePath: undefined,
    });
  });

  test("keeps repeated file references distinguishable with line labels", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: [
          "[first](/tmp/stave/src/components/session/ChatPanel.tsx:10)",
          "[second](/tmp/stave/src/components/session/ChatPanel.tsx:24)",
        ].join(" "),
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
          }),
      }),
    );

    expect(html).toContain("L10");
    expect(html).toContain("L24");
  });

  test("promotes labeled external links to compact link chips", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Visit [OpenAI](https://openai.com/)",
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('data-message-external-link-chip="true"');
    expect(html).not.toContain('data-message-file-link="true"');
  });

  test("promotes rich markdown labels to compact link chips", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Visit [**OpenAI Docs**](https://platform.openai.com/docs)",
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain('data-message-external-link-chip="true"');
    expect(html).toContain("OpenAI Docs");
    expect(html).toContain(
      'aria-label="Open OpenAI Docs on platform.openai.com"',
    );
  });

  test("keeps autolinked raw URLs as readable standard anchors", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Visit https://openai.com/ for details.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain("https://openai.com/");
    expect(html).not.toContain('data-message-external-link-chip="true"');
  });

  test("promotes raw URLs in table cells to compact link chips", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: [
          "| Name | Link |",
          "| --- | --- |",
          "| OpenAI | https://openai.com/ |",
        ].join("\n"),
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain("<td");
    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain('data-message-external-link-chip="true"');
    expect(html).toContain(
      'aria-label="Open https://openai.com/ on openai.com"',
    );
  });

  test("keeps slash-delimited non-file markdown links as anchors", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Track [repo](owner/repo) separately.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
        resolveFileLink: ({ href, allowUnknownPath }) =>
          resolveWorkspaceFileLink({
            href,
            workspaceCwd: "/tmp/stave",
            knownFilePaths,
            allowUnknownPaths: allowUnknownPath,
          }),
      }),
    );

    expect(html).toContain('href="owner/repo"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('data-message-file-link="true"');
  });

  test("applies numeric message and code font sizes to rendered markup", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Use `code` here.",
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain('style="font-size:18px;line-height:1.68"');
    expect(html).toContain('style="font-size:14px"');
  });

  test("wraps rendered markdown paragraphs with the paragraph style", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content:
          "averylongtokenthatshouldstillwrapinsideauserbubblewithoutoverflowingthelayout",
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    // StyleX hashes class names, so identity is checked against the compiled
    // style objects that own the wrapping behavior rather than Tailwind strings.
    const paragraphClass = sx(markdownStyles.paragraph);
    const bodyClass = sx(markdownStyles.body);
    expect(html).toContain("<p ");
    for (const token of paragraphClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
    for (const token of bodyClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
  });

  test("wraps the streaming text fallback with the streaming-body style", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content:
          "averylongstreamingtokenthatshouldstillwrapinsideauserbubblewithoutoverflowingthelayout",
        isStreaming: true,
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    const streamingClass = sx(markdownStyles.streamingBody);
    for (const token of streamingClass.split(/\s+/)) {
      expect(html).toContain(token);
    }
  });

  test("keeps streaming text fallback as plain text for hot-path performance", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, {
        content: "Local preview: https://stave.localhost:3000/test.",
        isStreaming: true,
        messageFontSize: 18,
        messageCodeFontSize: 14,
      }),
    );

    expect(html).toContain("https://stave.localhost:3000/test");
    expect(html).not.toContain("<a");
  });
});

describe("resolveWorkspaceFileLink", () => {
  test("returns workspace-relative file metadata for absolute file links", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "/tmp/stave/src/App.tsx:18:4",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
    });

    expect(resolved).toEqual({
      filePath: "src/App.tsx",
      fileName: "App.tsx",
      line: 18,
      column: 4,
    });
  });

  test("returns workspace-relative file metadata for relative file links", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "src/App.tsx#L27",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
    });

    expect(resolved).toEqual({
      filePath: "src/App.tsx",
      fileName: "App.tsx",
      line: 27,
    });
  });

  test("parses hash-style line references", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "/tmp/stave/src/App.tsx#L27C3",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
    });

    expect(resolved).toEqual({
      filePath: "src/App.tsx",
      fileName: "App.tsx",
      line: 27,
      column: 3,
    });
  });

  test("allows unknown relative paths when requested", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "src/new-file.tsx",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
      allowUnknownPaths: true,
    });

    expect(resolved).toEqual({
      filePath: "src/new-file.tsx",
      fileName: "new-file.tsx",
    });
  });

  test("rejects slash-delimited unknown paths without a file-like basename", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "owner/repo",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
      allowUnknownPaths: true,
    });

    expect(resolved).toBeNull();
  });

  test("keeps unknown-path mode strict for non-path strings", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "npm run dev",
      workspaceCwd: "/tmp/stave",
      allowUnknownPaths: true,
    });

    expect(resolved).toBeNull();
  });
});

describe("formatFileLinkLocation", () => {
  test("formats line and column labels for file chips", () => {
    expect(formatFileLinkLocation({ line: 42 })).toBe("L42");
    expect(formatFileLinkLocation({ line: 42, column: 7 })).toBe("L42:C7");
    expect(formatFileLinkLocation({})).toBeNull();
  });
});
