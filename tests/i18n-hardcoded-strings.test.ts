import { describe, expect, test } from "bun:test";
import { isAttributeProse, isCodeProse, isJsxProse, scanSource } from "../scripts/i18n/hardcoded-strings.mjs";

const terms = ["Stave", "Claude", "Enter"];

function scan(source: string, fileName = "src/components/demo.tsx") {
  return scanSource(fileName, source, { terms }).map((finding) => `${finding.rule}:${finding.text}`);
}

describe("hardcoded user-facing string scan", () => {
  test("a sentence ending in a field colon is prose while class and path tokens stay code", () => {
    expect(isCodeProse(' ${} is not a valid shared scripts config: ${} ', [])).toBe(true);
    expect(scan('const result = { error: `${filePath} is not a valid shared scripts config: ${issue}` };')).toEqual(["object-property:${} is not a valid shared scripts config: ${}"]);
    expect(isCodeProse("sm:flex items-center", [])).toBe(false);
    expect(isCodeProse("flex items-center", [])).toBe(false);
    expect(isCodeProse("path/to/config runtime/key", [])).toBe(false);
  });

  test("finds conditional titles inside interpolation without scanning protocol conditions", () => {
    const findings = scan('<Card title={`${props.kind === "service" ? "Process" : "Command"} ${props.index + 1}`} />');
    expect(findings).toEqual(["jsx-attribute:Process", "jsx-attribute:Command"]);
    expect(findings).not.toContain("jsx-attribute:service");
  });

  test("finds nested template and nullish fallback text in error and JSX positions", () => {
    const findings = scan(`
      const result = { error: \`\${ok ? \`\${value ?? "Missing response"}\` : "Not ready"}\` };
      export function Demo() {
        return <p>{\`\${value || (ok ? "Completed" : \`\${reason ?? "Try again"}\`)}\`}</p>;
      }
    `);
    expect(findings).toEqual([
      "object-property:Missing response", "object-property:Not ready",
      "jsx-expression:Completed", "jsx-expression:Try again",
    ]);
    expect(scan('<p>{`${t("common:save")} ${identifier}`}</p>')).toEqual([]);
  });

  test("requires catalogs for Korean visible text, accessibility, copy and native dialogs", () => {
    expect(scan(`
      const title = "작업 목록";
      const result = { error: "저장하지 못했습니다" };
      toast.error("다시 시도하세요");
      export function Demo() { return <button aria-label="닫기" title="설정" placeholder="이름 입력">예{\`\${ok ? "완료" : "대기 중"}\`}</button>; }
    `)).toEqual(expect.arrayContaining([
      "copy-variable:작업 목록", "object-property:저장하지 못했습니다", "toast:다시 시도하세요",
      "jsx-attribute:닫기", "jsx-attribute:설정", "jsx-attribute:이름 입력", "jsx-text:예",
      "jsx-expression:완료", "jsx-expression:대기 중",
    ]));
    expect(scanSource("electron/new-feature/dialog.ts", 'dialog.showMessageBox({ title: "확인", buttons: ["예", "아니요"] });', { terms, nativeUiOnly: true }).map((finding) => finding.text)).toEqual(["확인", "예", "아니요"]);
  });

  test("Korean detection preserves terms, paths and non-copy protocol positions", () => {
    for (const judge of [isAttributeProse, isCodeProse, isJsxProse]) {
      expect(judge("제품이름", ["제품이름"])).toBe(false);
      expect(judge("설정", terms)).toBe(true);
    }
    expect(isCodeProse("/문서/파일.txt", terms)).toBe(false);
    expect(isCodeProse("문서/파일.txt", terms)).toBe(false);
    expect(isCodeProse("https://example.com/한글", terms)).toBe(false);
    expect(scan('const response = { protocol: "완료", filePath: "/문서/파일.txt" }; <div data-testid="한국어-테스트" />;')).toEqual([]);
  });

  test("keeps deeply nested ignored model and protocol literals unchanged", () => {
    expect(scan(`
      // i18n-ignore: model-facing prompt remains in its original language
      const description = \`\${ok ? \`\${value ?? "모델에게 보내는 문구"}\` : "Model instructions"}\`;
      const title = \`\${ok ? \`\${value ?? "원본 프로토콜"}\` : "Protocol output"}\`; // i18n-ignore: protocol value
      const label = \`\${ok ? t("common:save") : t("common:cancel")}\`;
    `)).toEqual([]);
  });

  test("requires human accessible names even when they resemble automation ids", () => {
    expect(scan('<button aria-label="open-settings" data-testid="open-settings" />')).toEqual(["jsx-attribute:open-settings"]);
    expect(scan('<button aria-label={`toggle-project-${projectId}`} />')).toEqual(["jsx-attribute:toggle-project- ${}"]);
  });
  test("covers aliased accessibility defaults, error results and announcements", () => {
    const findings = scan(`
      function Demo({ "aria-label": label = "Tool calls", trigger = "Show command" }) {
        announce("Move cancelled.");
        setAnnouncement(\`Tab moved to position \${position}.\`);
        return { error: "Cannot open this task", note: "Choose a workspace", reason: "No workspace linked" };
      }
      const THINKING_PHRASES = ["Compiling thoughts", "Reading the docs"] as const;
    `);
    expect(findings).toEqual(expect.arrayContaining([
      "copy-default:Tool calls", "copy-default:Show command",
      "copy-call:Move cancelled.", "copy-call:Tab moved to position ${} .",
      "object-property:Cannot open this task", "object-property:Choose a workspace",
      "object-property:No workspace linked", "copy-variable:Compiling thoughts", "copy-variable:Reading the docs",
    ]));
  });
  test("flags JSX text, user-facing attributes, string children and toasts", () => {
    const findings = scan(`
      export function Demo({ ok, title = "Untitled task" }) {
        toast.error("Could not save", { description: "Try again later." });
        return (
          <section aria-label="Task list" title={ok ? "Ready" : "Not ready"}>
            <h1>Recent tasks</h1>
            {ok ? "All set" : null}
            <Field placeholder="Search tasks" emptyLabel={\`No \${"x"} yet\`} />
          </section>
        );
      }
    `);
    expect(findings).toEqual(
      expect.arrayContaining([
        "copy-default:Untitled task",
        "toast:Could not save",
        "toast:Try again later.",
        "jsx-attribute:Task list",
        "jsx-attribute:Ready",
        "jsx-attribute:Not ready",
        "jsx-text:Recent tasks",
        "jsx-expression:All set",
        "jsx-attribute:Search tasks",
        "jsx-attribute:No ${} yet",
      ]),
    );
  });

  test("flags copy in label tables and label helpers", () => {
    const findings = scan(
      `
      const STATUS_LABELS = { running: "Running", done: "Finished" };
      export function statusLabel(status) {
        if (status === "idle") return "Waiting for input";
        return STATUS_LABELS[status];
      }
      export const items = [{ id: "a", label: "Open settings" }];
    `,
      "src/lib/demo.ts",
    );
    expect(findings).toEqual([
      "copy-variable:Running",
      "copy-variable:Finished",
      "copy-return:Waiting for input",
      "object-property:Open settings",
    ]);
  });

  test("ignores identifiers, class lists, paths, terms and translated calls", () => {
    const findings = scan(`
      const modeLabel = "claude-code";
      export function Demo({ t }) {
        return (
          <div className="flex items-center" data-testid="task-row" title={t("tasks.title")}>
            <span>Claude</span>
            <kbd>Enter</kbd>
            <span>{"/"}</span>
            <Icon label="settings-gear" />
            <a href="https://example.com/docs">{t("docs.link")}</a>
          </div>
        );
      }
    `);
    expect(findings).toEqual([]);
  });

  test("honors i18n-ignore markers on the line or the line above", () => {
    const findings = scan(`
      // i18n-ignore: model-facing prompt
      const description = "Summarize the diff for the reviewer.";
      const summary = "Keep this as-is"; // i18n-ignore: protocol value
      const title = "Translate me";
    `);
    expect(findings).toEqual(["copy-variable:Translate me"]);
  });
});
