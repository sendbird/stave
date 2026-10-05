import { describe, expect, test } from "bun:test";
import { scanSource } from "../scripts/i18n/hardcoded-strings.mjs";

const terms = ["Stave", "Claude", "Enter"];

function scan(source: string, fileName = "src/components/demo.tsx") {
  return scanSource(fileName, source, { terms }).map((finding) => `${finding.rule}:${finding.text}`);
}

describe("hardcoded user-facing string scan", () => {
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
